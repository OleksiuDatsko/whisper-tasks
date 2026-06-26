import { MeteredPeer } from '@metered-ca/realtime';
import { useGameStore } from '../store/gameStore';
import type { CardInstance, Player } from '../types/game';

class WebRTCService {
  private peer: MeteredPeer | null = null;
  private hostPeerId: string | null = null;
  private currentRoomCode: string | null = null;
  private customIceServers: any[] = [];
  private myPeerId: string | null = null;
  private pendingPeers: Set<string> = new Set();

  async fetchIceServers(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch(`https://whisper-tasks.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch TURN credentials: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching custom ICE servers:', error);
      return [];
    }
  }

  /**
   * Connect to Metered signaling and join the room.
   */
  async connect(roomCode: string, role: 'host' | 'player'): Promise<void> {
    const store = useGameStore.getState();
    const apiKey = store.apiKey;

    if (!apiKey) {
      throw new Error('Metered API key is missing. Please set it in settings.');
    }

    this.currentRoomCode = roomCode.toUpperCase().trim();
    const channelName = `whisper-tasks-${this.currentRoomCode}`;
    
    store.setConnectionStatus('connecting');
    store.setRole(role);
    store.setRoomCode(this.currentRoomCode);

    let signalingKey = apiKey;
    if (!apiKey.startsWith('pk_')) {
      store.addLog('Отримання TURN-серверів за допомогою TURN API ключа...', 'info');
      this.customIceServers = await this.fetchIceServers(apiKey);
      store.addLog(`Отримано ${this.customIceServers.length} TURN/STUN серверів`, 'success');
      // For signaling, we must fallback to the default public Realtime Messaging key
      signalingKey = 'pk_live_d8438186a51d8db02c918ef9bcfb5c0f';
    } else {
      this.customIceServers = [];
    }

    try {
      // 1. Initialize MeteredPeer
      this.peer = new MeteredPeer({
        apiKey: signalingKey,
        rtcPeerConnectionFactory: (cfg) => {
          const iceServers = this.customIceServers.length > 0 ? this.customIceServers : (cfg.iceServers || []);
          return new RTCPeerConnection({
            ...cfg,
            iceServers
          }) as any;
        }
      });
      
      // 2. Set up event listeners
      this.peer.on('joined', ({ peerId, channel }) => {
        this.myPeerId = peerId;
        store.setPeerId(peerId);
        store.setConnectionStatus('connected');
        store.addLog(`Приєднано до кімнати сигналінгу ${channel}. Мій Peer ID: ${peerId}`, 'success');
        
        if (role === 'host') {
          store.addHostPlayer(peerId, store.playerName);
          
          // If there were any pending peers who joined before our 'joined' event resolved, announce ourselves now
          if (this.pendingPeers.size > 0) {
            this.pendingPeers.forEach((pId) => {
              this.announceHost(pId);
            });
            this.pendingPeers.clear();
          }
        }
      });

      this.peer.on('left', () => {
        this.myPeerId = null;
        this.pendingPeers.clear();
        store.setConnectionStatus('disconnected');
        store.addLog('Відключено від кімнати сигналінгу.', 'warning');
      });

      this.peer.on('state-change', ({ from, to }) => {
        store.addLog(`Стан зʼєднання змінився з "${from}" на "${to}"`, 'info');
        if (to === 'reconnecting') {
          store.setConnectionStatus('connecting');
        } else if (to === 'connected') {
          store.setConnectionStatus('connected');
        }
      });

      this.peer.on('peer-joined', ({ peer: remote }) => {
        store.addLog(`Виявлено новий вузол у кімнаті: ${remote.id}`, 'info');
        
        if (role === 'host') {
          if (this.myPeerId) {
            this.announceHost(remote.id);
          } else {
            this.pendingPeers.add(remote.id);
          }
        }
      });

      this.peer.on('peer-left', ({ peer: remote }) => {
        store.addLog(`Вузол вийшов з кімнати: ${remote.id}`, 'info');
        this.pendingPeers.delete(remote.id);
        if (role === 'host') {
          const leavingPlayer = store.players.find(p => p.peerId === remote.id);
          if (leavingPlayer) {
            if (store.gameStatus === 'lobby') {
              store.removePlayer(leavingPlayer.id);
            } else {
              store.setPlayerConnected(leavingPlayer.id, false);
            }
          }
          // Broadcast updated player list
          this.broadcastPlayers();
        } else if (remote.id === this.hostPeerId) {
          this.hostPeerId = null;
          store.setConnectionStatus('reconnecting');
          store.addLog('Звʼязок з хостом втрачено. Очікування перепідключення...', 'error');
        }
      });

      this.peer.on('data', ({ senderPeerId, data }) => {
        this.handleMessage(senderPeerId, data);
      });

      // 3. Join the channel
      await this.peer.join(channelName);
      
      if (role === 'player') {
        // Broadcast discovery message to find the Host in case they are already there
        // Wait a small timeout to make sure our connection is fully established
        setTimeout(() => {
          this.discoverHost();
        }, 1000);
      } else {
        // If Host
        if (this.myPeerId) {
          store.addHostPlayer(this.myPeerId, store.playerName);
        }
        
        const freshStore = useGameStore.getState();
        if (freshStore.gameStatus === 'lobby') {
          const hostPlayer = freshStore.players.find(p => p.isHost);
          store.setPlayers(hostPlayer ? [hostPlayer] : []);
        } else {
          // Keep players but mark them disconnected initially
          const updatedPlayers = freshStore.players.map(p => 
            p.isHost ? p : { ...p, isConnected: false }
          );
          store.setPlayers(updatedPlayers);
        }
        store.addLog(`Створено кімнату: ${this.currentRoomCode}. Очікуємо гравців...`, 'success');
      }

    } catch (error: any) {
      store.setConnectionStatus('disconnected');
      store.addLog(`Помилка зʼєднання: ${error.message || error}`, 'error');
      this.disconnect();
      throw error;
    }
  }

  /**
   * Leave the room and clean up resources.
   */
  disconnect() {
    const store = useGameStore.getState();
    if (this.peer) {
      try {
        this.peer.leave();
      } catch (e) {}
      this.peer = null;
    }
    this.myPeerId = null;
    this.pendingPeers.clear();
    this.hostPeerId = null;
    this.currentRoomCode = null;
    store.resetGame();
  }

  // ==========================================
  // HOST SPECIFIC ACTIONS
  // ==========================================

  /**
   * Broadcast host identity to a specific peer.
   */
  private announceHost(targetPeerId: string) {
    if (!this.peer || !this.myPeerId) return;
    this.peer.sendTo(targetPeerId, {
      type: 'host_announcement',
      payload: { hostId: this.myPeerId }
    });
  }

  /**
   * Broadcast current players list to everyone.
   */
  private broadcastPlayers() {
    if (!this.peer) return;
    const store = useGameStore.getState();
    this.peer.send({
      type: 'players_updated',
      payload: { players: store.players }
    });
  }

  /**
   * Host starts the game: shuffles the deck and issues initial cards to players.
   */
  startGame() {
    const store = useGameStore.getState();
    if (store.role !== 'host') return;

    const { playerAssignments, status } = store.hostStartGame();
    if (status !== 'playing') return;

    // Send individual snapshots to each player
    Object.keys(playerAssignments).forEach((playerId) => {
      const cards = playerAssignments[playerId];
      const history = store.cardInstances.filter(c => c.ownerPlayerId === playerId && c.status !== 'active');
      
      const player = store.players.find(p => p.id === playerId);
      if (player && !player.isHost && player.peerId) {
        this.sendSnapshotToPlayer(player.peerId, cards, history);
      }
    });

    // Broadcast that game has started
    if (this.peer) {
      this.peer.send({
        type: 'game_started',
        payload: { status: 'playing', players: store.players }
      });
      
      // Send updated players list
      this.broadcastPlayers();
    }
  }

  /**
   * Sends the full state snapshot to a specific player's WebRTC address.
   */
  private sendSnapshotToPlayer(destinationPeerId: string, activeCards: CardInstance[], resolvedCards: CardInstance[]) {
    if (!this.peer) return;
    const store = useGameStore.getState();
    
    this.peer.sendTo(destinationPeerId, {
      type: 'state_snapshot',
      payload: {
        roomId: this.currentRoomCode,
        players: store.players,
        myCards: activeCards,
        resolvedCards: resolvedCards,
        gameStatus: store.gameStatus
      }
    });
  }

  /**
   * Flushes and sends all accumulated offline actions to the Host once reconnected.
   */
  private flushOfflineQueue() {
    const store = useGameStore.getState();
    if (store.offlineQueue.length === 0) return;

    store.addLog(`Надсилання ${store.offlineQueue.length} накопичених офлайн-дій хосту...`, 'info');
    
    // Copy queue, clear it first to avoid any duplicate replays if actions trigger async calls
    const queueCopy = [...store.offlineQueue];
    store.clearOfflineActions();

    queueCopy.forEach((action) => {
      if (action.type === 'complete') {
        this.completeCard(action.cardInstanceId, action.completedByPlayerId || '');
      } else if (action.type === 'guess') {
        this.guessCard(action.cardInstanceId);
      }
    });
  }

  // ==========================================
  // PLAYER SPECIFIC ACTIONS
  // ==========================================

  /**
   * Player broadcasts discovery message to find the Host.
   */
  private discoverHost() {
    if (!this.peer) return;
    this.peer.send({
      type: 'host_discovery',
      payload: {}
    });
  }

  /**
   * Player sends completed card action to Host.
   */
  completeCard(instanceId: string, completedByPlayerId: string) {
    const store = useGameStore.getState();
    if (store.role === 'host') {
      store.addLog('Хост локально виконує своє завдання...', 'info');
      const result = store.hostResolveCard(instanceId, 'completed', completedByPlayerId);
      if (result) {
        this.broadcastPlayers();
      }
      return;
    }

    // Optimistically resolve locally
    store.playerResolveCardLocally(instanceId, 'completed', completedByPlayerId);

    const hostId = this.hostPeerId;
    if (!this.peer || !hostId || store.connectionStatus !== 'connected') {
      store.queueOfflineAction({
        type: 'complete',
        cardInstanceId: instanceId,
        completedByPlayerId
      });
      return;
    }

    store.addLog('Надсилання запиту на виконання завдання...', 'info');
    this.peer.sendTo(hostId, {
      type: 'mark_card_completed',
      payload: { instanceId, completedByPlayerId }
    });
  }

  /**
   * Player sends guessed card action to Host.
   */
  guessCard(instanceId: string) {
    const store = useGameStore.getState();
    if (store.role === 'host') {
      store.addLog('Хост локально фіксує відгадування свого завдання...', 'info');
      const result = store.hostResolveCard(instanceId, 'guessed', null);
      if (result) {
        this.broadcastPlayers();
      }
      return;
    }

    // Optimistically resolve locally
    store.playerResolveCardLocally(instanceId, 'guessed', null);

    const hostId = this.hostPeerId;
    if (!this.peer || !hostId || store.connectionStatus !== 'connected') {
      store.queueOfflineAction({
        type: 'guess',
        cardInstanceId: instanceId
      });
      return;
    }

    store.addLog('Надсилання запиту: завдання відгадано...', 'info');
    this.peer.sendTo(hostId, {
      type: 'mark_card_guessed',
      payload: { instanceId }
    });
  }

  /**
   * Host kicks a player from the game.
   */
  kickPlayer(playerId: string) {
    const store = useGameStore.getState();
    if (store.role !== 'host') return;

    const player = store.players.find(p => p.id === playerId);
    store.addLog(`Вилучення гравця ${player?.name || playerId} з кімнати`, 'warning');
    
    // Notify the player so they can disconnect
    if (this.peer && player && player.peerId) {
      this.peer.sendTo(player.peerId, {
        type: 'kicked',
        payload: {}
      });
    }

    store.removePlayer(playerId);
    this.broadcastPlayers();
  }

  // ==========================================
  // MESSAGE DISPATCHER / ROUTER
  // ==========================================

  private handleMessage(senderPeerId: string, message: any) {
    const store = useGameStore.getState();
    const role = store.role;

    if (!message || typeof message !== 'object' || !message.type) return;

    // --- SHARED MESSAGES ---
    if (message.type === 'host_discovery' && role === 'host') {
      // Player is searching for host, announce ourselves
      this.announceHost(senderPeerId);
      return;
    }

    if (message.type === 'host_announcement' && role === 'player') {
      // We found the host!
      const hostId = message.payload.hostId;
      this.hostPeerId = hostId;
      store.addLog(`Знайдено Хоста: ${hostId}. Реєстрація у грі...`, 'success');
      
      // Register our player name with the host
      if (this.peer && hostId) {
        this.peer.sendTo(hostId, {
          type: 'join_room',
          payload: { name: store.playerName, playerId: store.sessionPlayerId }
        });
      }
      return;
    }

    // --- HOST-ONLY MESSAGES (actions sent from players) ---
    if (role === 'host') {
      switch (message.type) {
        case 'join_room': {
          const { name, playerId } = message.payload;
          store.addPlayer(playerId, senderPeerId, name);
          
          // Send current state snapshot to the joined player
          const activeCards = store.cardInstances.filter(c => c.ownerPlayerId === playerId && c.status === 'active');
          const resolvedCards = store.cardInstances.filter(c => c.ownerPlayerId === playerId && c.status !== 'active');
          
          this.sendSnapshotToPlayer(senderPeerId, activeCards, resolvedCards);
          
          // Broadcast updated player list to all peers
          this.broadcastPlayers();
          break;
        }

        case 'mark_card_completed': {
          const { instanceId, completedByPlayerId } = message.payload;
          const result = store.hostResolveCard(instanceId, 'completed', completedByPlayerId);
          
          if (result && this.peer) {
            const { updatedCard, newCard } = result;
            const ownerId = updatedCard.ownerPlayerId;
            
            // Notify the owner of the changes (only if it's not the host)
            if (ownerId !== store.sessionPlayerId) {
              const ownerPlayer = store.players.find(p => p.id === ownerId);
              const destinationPeerId = ownerPlayer?.peerId;
              
              if (destinationPeerId) {
                this.peer.sendTo(destinationPeerId, {
                  type: 'card_updated',
                  payload: { card: updatedCard }
                });
                
                if (newCard) {
                  this.peer.sendTo(destinationPeerId, {
                    type: 'new_card_assigned',
                    payload: { card: newCard }
                  });
                }
              }
            }

            // 2. Broadcast updated player registry to everyone
            this.broadcastPlayers();
          }
          break;
        }

        case 'mark_card_guessed': {
          const { instanceId } = message.payload;
          const result = store.hostResolveCard(instanceId, 'guessed', null);
          
          if (result && this.peer) {
            const { updatedCard, newCard } = result;
            const ownerId = updatedCard.ownerPlayerId;
            
            // Notify the owner of the changes (only if it's not the host)
            if (ownerId !== store.sessionPlayerId) {
              const ownerPlayer = store.players.find(p => p.id === ownerId);
              const destinationPeerId = ownerPlayer?.peerId;
              
              if (destinationPeerId) {
                this.peer.sendTo(destinationPeerId, {
                  type: 'card_updated',
                  payload: { card: updatedCard }
                });
                
                if (newCard) {
                  this.peer.sendTo(destinationPeerId, {
                    type: 'new_card_assigned',
                    payload: { card: newCard }
                  });
                }
              }
            }

            // 2. Broadcast updated player registry to everyone
            this.broadcastPlayers();
          }
          break;
        }
      }
    }

    // --- PLAYER-ONLY MESSAGES (snapshots and state updates from host) ---
    if (role === 'player' && senderPeerId === this.hostPeerId) {
      switch (message.type) {
        case 'state_snapshot': {
          store.updateFromSnapshot(message.payload);
          store.setConnectionStatus('connected');
          store.addLog('Отримано оновлений стан гри від Хоста', 'info');
          this.flushOfflineQueue();
          break;
        }

        case 'card_updated': {
          const card = message.payload.card as CardInstance;
          store.updateCardInstance(card);
          
          if (card.status === 'completed') {
            store.addLog('Вітаємо! Ваше завдання успішно зараховано!', 'success');
          } else if (card.status === 'guessed') {
            store.addLog('О ні! Вашу картку було відгадано іншим гравцем!', 'warning');
          }
          break;
        }

        case 'new_card_assigned': {
          const card = message.payload.card as CardInstance;
          store.assignNewCard(card);
          store.addLog(`Отримано нове завдання: "${card.text}"`, 'success');
          break;
        }

        case 'players_updated': {
          const playersList = message.payload.players as Player[];
          store.setPlayers(playersList);
          break;
        }

        case 'game_started': {
          const playersList = message.payload.players as Player[];
          store.startPlayerGame(playersList);
          store.addLog('Гру розпочато! Розраховано ваші секретні картки...', 'success');
          break;
        }

        case 'kicked': {
          store.addLog('Вас було вилучено з кімнати хостом.', 'error');
          this.disconnect();
          break;
        }
      }
    }
  }
}

export const webrtcService = new WebRTCService();
