import { create } from 'zustand';
import type { CatalogCard, CardInstance, Player, GameStatus, GameRole, ConnectionStatus, OfflineAction } from '../types/game';
import { hashCode, seededShuffle } from '../utils/random';

interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface GameState {
  // Common states
  playerName: string;
  roomCode: string | null;
  role: GameRole | null;
  peerId: string | null;
  connectionStatus: ConnectionStatus;
  gameStatus: GameStatus;
  players: Player[];
  apiKey: string; // Metered publishable key
  sessionPlayerId: string;

  // Player-specific states
  myCards: CardInstance[];
  resolvedCards: CardInstance[];
  offlineQueue: OfflineAction[];
  playerIndex: number | null;
  cardsDrawn: number;

  // Host-specific states
  deck: CatalogCard[];
  shuffledDeck: CatalogCard[];
  cardInstances: CardInstance[];
  logs: LogMessage[];

  // Setters & Common Actions
  setPlayerName: (name: string) => void;
  setRoomCode: (code: string | null) => void;
  setRole: (role: GameRole | null) => void;
  setPeerId: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setGameStatus: (status: GameStatus) => void;
  setPlayers: (players: Player[]) => void;
  setApiKey: (key: string) => void;
  addLog: (text: string, type?: LogMessage['type']) => void;
  clearLogs: () => void;
  resetGame: () => void;
  queueOfflineAction: (action: OfflineAction) => void;
  clearOfflineActions: () => void;
  setPlayerIndex: (index: number | null) => void;
  setCardsDrawn: (count: number) => void;
  startPlayerGame: (frozenPlayers: Player[]) => void;
  playerResolveCardLocally: (
    instanceId: string,
    status: 'completed' | 'guessed',
    byPlayerId: string | null
  ) => void;

  // Player Actions (triggered by incoming WebRTC messages)
  updateFromSnapshot: (payload: { roomId: string; players: Player[]; myCards: CardInstance[]; resolvedCards: CardInstance[]; gameStatus: GameStatus }) => void;
  updateCardInstance: (card: CardInstance) => void;
  assignNewCard: (card: CardInstance) => void;

  // Host Actions (authoritative logic)
  setCatalogDeck: (cards: CatalogCard[]) => void;
  addPlayer: (playerId: string, peerId: string, name: string) => void;
  addHostPlayer: (peerId: string, name: string) => void;
  removePlayer: (id: string) => void;
  setPlayerConnected: (id: string, isConnected: boolean) => void;
  hostStartGame: () => { playerAssignments: Record<string, CardInstance[]>, status: GameStatus };
  hostResolveCard: (
    instanceId: string,
    status: 'completed' | 'guessed',
    byPlayerId: string | null
  ) => { updatedCard: CardInstance; newCard: CardInstance | null; updatedPlayers: Player[] } | null;
}

const DEFAULT_METERED_KEY = 'pk_live_d0ce86b0f055d49ae7a48ae385c732aab15cc757';

const getOrCreateSessionPlayerId = () => {
  let id = localStorage.getItem('wt_session_player_id');
  if (!id) {
    id = `p_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('wt_session_player_id', id);
  }
  return id;
};

const sessionPlayerId = getOrCreateSessionPlayerId();

const loadPersistedState = () => {
  try {
    const role = localStorage.getItem('wt_role') as GameRole | null;
    const roomCode = localStorage.getItem('wt_room_code');
    const gameStatus = (localStorage.getItem('wt_game_status') || 'lobby') as GameStatus;
    const playerIndex = localStorage.getItem('wt_player_index') ? parseInt(localStorage.getItem('wt_player_index') || '0', 10) : null;
    const cardsDrawn = parseInt(localStorage.getItem('wt_player_cards_drawn') || '0', 10);
    const deck = JSON.parse(localStorage.getItem('wt_host_deck') || '[]') as CatalogCard[];

    if (role === 'host') {
      const players = JSON.parse(localStorage.getItem('wt_host_players') || '[]') as Player[];
      const cardInstances = JSON.parse(localStorage.getItem('wt_host_card_instances') || '[]') as CardInstance[];
      const shuffledDeck = JSON.parse(localStorage.getItem('wt_host_shuffled_deck') || '[]') as CatalogCard[];
      return {
        role,
        roomCode,
        gameStatus,
        players,
        deck,
        shuffledDeck,
        cardInstances,
        playerIndex,
        cardsDrawn,
        myCards: cardInstances.filter(c => c.ownerPlayerId === sessionPlayerId && c.status === 'active'),
        resolvedCards: cardInstances.filter(c => c.ownerPlayerId === sessionPlayerId && c.status !== 'active'),
      };
    } else {
      const players = JSON.parse(localStorage.getItem('wt_player_players') || '[]') as Player[];
      const myCards = JSON.parse(localStorage.getItem('wt_player_my_cards') || '[]') as CardInstance[];
      const resolvedCards = JSON.parse(localStorage.getItem('wt_player_resolved_cards') || '[]') as CardInstance[];
      return {
        role,
        roomCode,
        gameStatus,
        players,
        deck,
        shuffledDeck: [],
        cardInstances: [],
        playerIndex,
        cardsDrawn,
        myCards,
        resolvedCards,
      };
    }
  } catch (e) {
    console.error('Error loading persisted state from localStorage', e);
    return null;
  }
};

const persistedState = loadPersistedState();

export const useGameStore = create<GameState>((set, get) => ({
  // Initial states (rehydrate from localStorage)
  playerName: localStorage.getItem('wt_player_name') || '',
  roomCode: persistedState?.roomCode || null,
  role: (localStorage.getItem('wt_role') as GameRole | null) || null,
  peerId: null,
  connectionStatus: 'disconnected',
  gameStatus: persistedState?.gameStatus || 'lobby',
  players: persistedState?.players || [],
  apiKey: localStorage.getItem('wt_api_key') || DEFAULT_METERED_KEY,
  sessionPlayerId,

  myCards: persistedState?.myCards || [],
  resolvedCards: persistedState?.resolvedCards || [],
  offlineQueue: JSON.parse(localStorage.getItem('wt_offline_queue') || '[]') as OfflineAction[],
  playerIndex: persistedState?.playerIndex !== undefined && persistedState?.playerIndex !== null ? persistedState.playerIndex : null,
  cardsDrawn: persistedState?.cardsDrawn || 0,

  deck: persistedState?.deck || [],
  shuffledDeck: persistedState?.shuffledDeck || [],
  cardInstances: persistedState?.cardInstances || [],
  logs: [],

  // Setters
  setPlayerName: (name) => {
    localStorage.setItem('wt_player_name', name);
    set({ playerName: name });
  },
  setRoomCode: (code) => {
    if (code) {
      localStorage.setItem('wt_room_code', code);
    } else {
      localStorage.removeItem('wt_room_code');
    }
    set({ roomCode: code });
  },
  setRole: (role) => {
    if (role) {
      localStorage.setItem('wt_role', role);
    } else {
      localStorage.removeItem('wt_role');
    }
    set({ role });
  },
  setPeerId: (id) => set({ peerId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setGameStatus: (status) => {
    localStorage.setItem('wt_game_status', status);
    set({ gameStatus: status });
  },
  setPlayers: (players) => {
    if (get().role === 'host') {
      localStorage.setItem('wt_host_players', JSON.stringify(players));
    }
    set({ players });
  },
  setApiKey: (key) => {
    localStorage.setItem('wt_api_key', key);
    set({ apiKey: key });
  },

  addLog: (text, type = 'info') => {
    const newLog: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      text,
      type,
    };
    set((state) => ({ logs: [newLog, ...state.logs].slice(0, 100) }));
  },

  clearLogs: () => set({ logs: [] }),

  queueOfflineAction: (action) => {
    set((state) => {
      // Avoid duplicate completions of the same card in the queue
      if (state.offlineQueue.some(q => q.cardInstanceId === action.cardInstanceId)) {
        return {};
      }
      const newQueue = [...state.offlineQueue, action];
      localStorage.setItem('wt_offline_queue', JSON.stringify(newQueue));
      return { offlineQueue: newQueue };
    });
    get().addLog(`Завдання додано в чергу (хост офлайн)`, 'warning');
  },

  clearOfflineActions: () => {
    localStorage.removeItem('wt_offline_queue');
    set({ offlineQueue: [] });
  },

  setPlayerIndex: (index) => {
    if (index !== null) {
      localStorage.setItem('wt_player_index', index.toString());
    } else {
      localStorage.removeItem('wt_player_index');
    }
    set({ playerIndex: index });
  },

  setCardsDrawn: (count) => {
    localStorage.setItem('wt_player_cards_drawn', count.toString());
    set({ cardsDrawn: count });
  },

  startPlayerGame: (frozenPlayers) => {
    const { roomCode, deck, sessionPlayerId } = get();
    if (!roomCode || deck.length === 0) return;

    const seed = hashCode(roomCode);
    const shuffled = seededShuffle(deck, seed);

    const sortedPlayers = [...frozenPlayers].sort((a, b) => a.id.localeCompare(b.id));
    const pIndex = sortedPlayers.findIndex(p => p.id === sessionPlayerId);

    if (pIndex === -1) {
      set({
        shuffledDeck: shuffled,
        players: frozenPlayers,
        playerIndex: null,
        cardsDrawn: 0,
        myCards: [],
        resolvedCards: [],
      });
      return;
    }

    const N = sortedPlayers.length;
    const initialCards: CardInstance[] = [];
    for (let s = 0; s < 3; s++) {
      const deckIndex = pIndex + s * N;
      const card = shuffled[deckIndex % shuffled.length];
      initialCards.push({
        instanceId: `inst-${deckIndex}`,
        catalogTaskId: card.id,
        text: card.text,
        ownerPlayerId: sessionPlayerId,
        status: 'active',
        completedByPlayerId: null,
        guessedByPlayerId: null,
        assignedAt: new Date().toISOString(),
        resolvedAt: null,
      });
    }

    localStorage.setItem('wt_player_index', pIndex.toString());
    localStorage.setItem('wt_player_cards_drawn', '3');
    localStorage.setItem('wt_player_my_cards', JSON.stringify(initialCards));
    localStorage.setItem('wt_player_resolved_cards', JSON.stringify([]));
    localStorage.setItem('wt_player_players', JSON.stringify(frozenPlayers));
    localStorage.setItem('wt_game_status', 'playing');

    set({
      gameStatus: 'playing',
      shuffledDeck: shuffled,
      players: frozenPlayers,
      playerIndex: pIndex,
      cardsDrawn: 3,
      myCards: initialCards,
      resolvedCards: [],
    });
  },

  playerResolveCardLocally: (instanceId, status, byPlayerId) => {
    const { myCards, resolvedCards, playerIndex, cardsDrawn, shuffledDeck, players, sessionPlayerId } = get();
    if (playerIndex === null || shuffledDeck.length === 0) return;

    const targetCardIndex = myCards.findIndex(c => c.instanceId === instanceId);
    if (targetCardIndex === -1) return;

    const targetCard = myCards[targetCardIndex];

    const updatedCard: CardInstance = {
      ...targetCard,
      status,
      completedByPlayerId: status === 'completed' ? byPlayerId : null,
      guessedByPlayerId: status === 'guessed' ? byPlayerId : null,
      resolvedAt: new Date().toISOString(),
    };

    // Draw the next card for this slot
    const N = players.length;
    const nextDeckIndex = playerIndex + cardsDrawn * N;
    const nextCatalogCard = shuffledDeck[nextDeckIndex % shuffledDeck.length];

    const newCard: CardInstance = {
      instanceId: `inst-${nextDeckIndex}`,
      catalogTaskId: nextCatalogCard.id,
      text: nextCatalogCard.text,
      ownerPlayerId: sessionPlayerId,
      status: 'active',
      completedByPlayerId: null,
      guessedByPlayerId: null,
      assignedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    const newMyCards = [...myCards];
    newMyCards[targetCardIndex] = newCard; // replace with new card

    const newResolvedCards = [updatedCard, ...resolvedCards];
    const newCardsDrawn = cardsDrawn + 1;

    // Update score in players list locally for instant UI update
    const newPlayers = players.map(p => {
      if (p.id === sessionPlayerId && status === 'completed') {
        return { ...p, score: (p.score || 0) + 1 };
      }
      return p;
    });

    localStorage.setItem('wt_player_my_cards', JSON.stringify(newMyCards));
    localStorage.setItem('wt_player_resolved_cards', JSON.stringify(newResolvedCards));
    localStorage.setItem('wt_player_cards_drawn', newCardsDrawn.toString());
    localStorage.setItem('wt_player_players', JSON.stringify(newPlayers));

    set({
      myCards: newMyCards,
      resolvedCards: newResolvedCards,
      cardsDrawn: newCardsDrawn,
      players: newPlayers,
    });
  },

  resetGame: () => {
    // Clear persisted state keys
    localStorage.removeItem('wt_role');
    localStorage.removeItem('wt_room_code');
    localStorage.removeItem('wt_game_status');
    localStorage.removeItem('wt_host_players');
    localStorage.removeItem('wt_host_deck');
    localStorage.removeItem('wt_host_shuffled_deck');
    localStorage.removeItem('wt_host_card_instances');
    localStorage.removeItem('wt_offline_queue');
    localStorage.removeItem('wt_player_index');
    localStorage.removeItem('wt_player_cards_drawn');
    localStorage.removeItem('wt_player_my_cards');
    localStorage.removeItem('wt_player_resolved_cards');
    localStorage.removeItem('wt_player_players');

    set({
      roomCode: null,
      role: null,
      peerId: null,
      connectionStatus: 'disconnected',
      gameStatus: 'lobby',
      players: [],
      myCards: [],
      resolvedCards: [],
      shuffledDeck: [],
      cardInstances: [],
      logs: [],
      offlineQueue: [],
      playerIndex: null,
      cardsDrawn: 0,
    });
  },

  // Player updates from messages
  updateFromSnapshot: (payload) => {
    const { offlineQueue, sessionPlayerId, deck, shuffledDeck } = get();

    localStorage.setItem('wt_player_players', JSON.stringify(payload.players));
    localStorage.setItem('wt_game_status', payload.gameStatus);

    const sortedPlayers = [...payload.players].sort((a, b) => a.id.localeCompare(b.id));
    const pIndex = sortedPlayers.findIndex(p => p.id === sessionPlayerId);
    let resolvedShuffledDeck = shuffledDeck;

    if (pIndex !== -1) {
      localStorage.setItem('wt_player_index', pIndex.toString());
      if (shuffledDeck.length === 0 && deck.length > 0 && payload.roomId) {
        const seed = hashCode(payload.roomId);
        resolvedShuffledDeck = seededShuffle(deck, seed);
      }
    }

    if (offlineQueue.length > 0) {
      set({
        roomCode: payload.roomId,
        players: payload.players,
        gameStatus: payload.gameStatus,
        playerIndex: pIndex !== -1 ? pIndex : null,
        shuffledDeck: resolvedShuffledDeck,
      });
    } else {
      const drawCount = payload.myCards.length + payload.resolvedCards.length;
      localStorage.setItem('wt_player_my_cards', JSON.stringify(payload.myCards));
      localStorage.setItem('wt_player_resolved_cards', JSON.stringify(payload.resolvedCards));
      localStorage.setItem('wt_player_cards_drawn', drawCount.toString());

      set({
        roomCode: payload.roomId,
        players: payload.players,
        myCards: payload.myCards,
        resolvedCards: payload.resolvedCards,
        gameStatus: payload.gameStatus,
        playerIndex: pIndex !== -1 ? pIndex : null,
        cardsDrawn: drawCount,
        shuffledDeck: resolvedShuffledDeck,
      });
    }
  },

  updateCardInstance: (card) => {
    set((state) => {
      const isResolved = card.status === 'completed' || card.status === 'guessed';
      
      let newMyCards = state.myCards;
      let newResolvedCards = state.resolvedCards;

      if (isResolved) {
        newMyCards = state.myCards.filter((c) => c.instanceId !== card.instanceId);
        if (!state.resolvedCards.some((c) => c.instanceId === card.instanceId)) {
          newResolvedCards = [card, ...state.resolvedCards];
        }
      } else {
        newMyCards = state.myCards.map((c) => c.instanceId === card.instanceId ? card : c);
      }

      return {
        myCards: newMyCards,
        resolvedCards: newResolvedCards,
      };
    });
  },

  assignNewCard: (card) => {
    set((state) => {
      if (state.myCards.some((c) => c.instanceId === card.instanceId)) {
        return {};
      }
      return {
        myCards: [...state.myCards, card],
      };
    });
  },

  // Host Authority Operations
  setCatalogDeck: (cards) => {
    localStorage.setItem('wt_host_deck', JSON.stringify(cards));
    set({ deck: cards });
  },

  addPlayer: (playerId, peerId, name) => {
    set((state) => {
      let newPlayers = state.players;
      if (state.players.some((p) => p.id === playerId)) {
        newPlayers = state.players.map((p) => 
          p.id === playerId ? { ...p, peerId, name, isConnected: true } : p
        );
      } else {
        const newPlayer: Player = {
          id: playerId,
          peerId,
          name,
          isConnected: true,
          cardCount: state.cardInstances.filter(c => c.ownerPlayerId === playerId && c.status === 'active').length || 0,
          score: 0,
        };
        newPlayers = [...state.players, newPlayer];
      }
      localStorage.setItem('wt_host_players', JSON.stringify(newPlayers));
      return { players: newPlayers };
    });
    get().addLog(`Гравець "${name}" приєднався до кімнати`, 'success');
  },

  addHostPlayer: (peerId, name) => {
    const hostPlayerId = get().sessionPlayerId;
    set((state) => {
      const cleanPlayers = state.players.filter((p) => p.id !== hostPlayerId);
      const oldHost = state.players.find((p) => p.id === hostPlayerId);
      let newCardInstances = state.cardInstances;
      if (oldHost) {
        newCardInstances = state.cardInstances.map((c) => 
          c.ownerPlayerId === oldHost.id ? { ...c, ownerPlayerId: hostPlayerId } : c
        );
      }

      const hostPlayer: Player = {
        id: hostPlayerId,
        peerId,
        name,
        isConnected: true,
        cardCount: newCardInstances.filter(c => c.ownerPlayerId === hostPlayerId && c.status === 'active').length || 0,
        isHost: true,
        score: oldHost ? (oldHost.score || 0) : 0,
      };
      
      const newPlayers = [hostPlayer, ...cleanPlayers];
      localStorage.setItem('wt_host_players', JSON.stringify(newPlayers));
      localStorage.setItem('wt_host_card_instances', JSON.stringify(newCardInstances));
      
      const hostCards = newCardInstances.filter(c => c.ownerPlayerId === hostPlayerId && c.status === 'active');
      const hostResolvedCards = newCardInstances.filter(c => c.ownerPlayerId === hostPlayerId && c.status !== 'active');
      
      return { 
        players: newPlayers,
        cardInstances: newCardInstances,
        myCards: hostCards,
        resolvedCards: hostResolvedCards
      };
    });
    get().addLog(`Хост "${name}" приєднався до гри як гравець`, 'success');
  },

  removePlayer: (id) => {
    const player = get().players.find((p) => p.id === id);
    set((state) => {
      const newPlayers = state.players.filter((p) => p.id !== id);
      const newCardInstances = state.cardInstances.filter((c) => c.ownerPlayerId !== id);
      
      localStorage.setItem('wt_host_players', JSON.stringify(newPlayers));
      localStorage.setItem('wt_host_card_instances', JSON.stringify(newCardInstances));

      return {
        players: newPlayers,
        cardInstances: newCardInstances,
      };
    });
    if (player) {
      get().addLog(`Гравець "${player.name}" вийшов з кімнати`, 'warning');
    }
  },

  setPlayerConnected: (id, isConnected) => {
    const player = get().players.find((p) => p.id === id);
    set((state) => {
      const newPlayers = state.players.map((p) => p.id === id ? { ...p, isConnected } : p);
      localStorage.setItem('wt_host_players', JSON.stringify(newPlayers));
      return { players: newPlayers };
    });
    if (player) {
      get().addLog(
        `Гравець "${player.name}" ${isConnected ? 'повернувся в мережу' : 'втратив звʼязок'}`,
        isConnected ? 'info' : 'error'
      );
    }
  },

  hostStartGame: () => {
    const { roomCode, deck, players } = get();
    if (!roomCode || deck.length === 0) {
      get().addLog('Неможливо почати гру: каталог карток порожній або кімната не ініціалізована!', 'error');
      return { playerAssignments: {}, status: 'lobby' };
    }

    get().addLog('Початок гри! Перемішування колоди та роздача карток за допомогою seeded-deck...', 'info');

    const seed = hashCode(roomCode);
    const shuffled = seededShuffle(deck, seed);
    const playerAssignments: Record<string, CardInstance[]> = {};
    const initialInstances: CardInstance[] = [];

    // Sort players stably by ID to assign playerIndex
    const sortedPlayers = [...players].sort((a, b) => a.id.localeCompare(b.id));
    const N = sortedPlayers.length;

    sortedPlayers.forEach((player, pIndex) => {
      playerAssignments[player.id] = [];
      for (let s = 0; s < 3; s++) {
        const deckIndex = pIndex + s * N;
        const card = shuffled[deckIndex % shuffled.length];
        const instance: CardInstance = {
          instanceId: `inst-${deckIndex}`,
          catalogTaskId: card.id,
          text: card.text,
          ownerPlayerId: player.id,
          status: 'active',
          completedByPlayerId: null,
          guessedByPlayerId: null,
          assignedAt: new Date().toISOString(),
          resolvedAt: null,
        };
        playerAssignments[player.id].push(instance);
        initialInstances.push(instance);
      }
    });

    const updatedPlayers = players.map((p) => {
      const hasAssigned = playerAssignments[p.id];
      return {
        ...p,
        cardCount: hasAssigned ? 3 : 0,
        score: 0,
      };
    });

    const hostId = get().sessionPlayerId;
    const hostIndex = sortedPlayers.findIndex(p => p.id === hostId);
    const hostCards = initialInstances.filter(c => c.ownerPlayerId === hostId && c.status === 'active');

    localStorage.setItem('wt_game_status', 'playing');
    localStorage.setItem('wt_host_shuffled_deck', JSON.stringify(shuffled));
    localStorage.setItem('wt_host_card_instances', JSON.stringify(initialInstances));
    localStorage.setItem('wt_host_players', JSON.stringify(updatedPlayers));

    if (hostIndex !== -1) {
      localStorage.setItem('wt_player_index', hostIndex.toString());
      localStorage.setItem('wt_player_cards_drawn', '3');
      localStorage.setItem('wt_player_my_cards', JSON.stringify(hostCards));
      localStorage.setItem('wt_player_resolved_cards', JSON.stringify([]));
      localStorage.setItem('wt_player_players', JSON.stringify(updatedPlayers));
    }

    set({
      gameStatus: 'playing',
      shuffledDeck: shuffled,
      cardInstances: initialInstances,
      players: updatedPlayers,
      playerIndex: hostIndex !== -1 ? hostIndex : null,
      cardsDrawn: hostIndex !== -1 ? 3 : 0,
      myCards: hostCards,
      resolvedCards: [],
    });

    get().addLog('Гру розпочато! Роздано по 3 картки.', 'success');

    return { playerAssignments, status: 'playing' };
  },

  hostResolveCard: (instanceId, status, byPlayerId) => {
    const { cardInstances, shuffledDeck, players } = get();
    const instanceIndex = cardInstances.findIndex((c) => c.instanceId === instanceId);

    if (instanceIndex === -1) {
      get().addLog(`Помилка: картку з ID ${instanceId} не знайдено!`, 'error');
      return null;
    }

    const instance = cardInstances[instanceIndex];
    if (instance.status !== 'active') {
      get().addLog(`Помилка: картка вже закрита (статус: ${instance.status})`, 'error');
      return null;
    }

    const owner = players.find((p) => p.id === instance.ownerPlayerId);
    const resolver = byPlayerId ? players.find((p) => p.id === byPlayerId) : null;

    const updatedCard: CardInstance = {
      ...instance,
      status,
      completedByPlayerId: status === 'completed' ? byPlayerId : null,
      guessedByPlayerId: status === 'guessed' ? byPlayerId : null,
      resolvedAt: new Date().toISOString(),
    };

    if (status === 'completed' && owner && resolver) {
      get().addLog(
        `Завдання виконано! Гравцю "${owner.name}" допоміг "${resolver.name}": "${instance.text}"`,
        'success'
      );
    } else if (status === 'guessed' && owner) {
      get().addLog(
        `Завдання відгадано! Картку гравця "${owner.name}" розкрили: "${instance.text}"`,
        'warning'
      );
    }

    const sortedPlayers = [...players].sort((a, b) => a.id.localeCompare(b.id));
    const ownerIndex = sortedPlayers.findIndex(p => p.id === instance.ownerPlayerId);

    let newCard: CardInstance | null = null;
    if (ownerIndex !== -1 && shuffledDeck.length > 0) {
      const N = sortedPlayers.length;
      const playerInstances = cardInstances.filter(c => c.ownerPlayerId === instance.ownerPlayerId);
      const nextDeckIndex = ownerIndex + playerInstances.length * N;
      const nextCatalogCard = shuffledDeck[nextDeckIndex % shuffledDeck.length];

      newCard = {
        instanceId: `inst-${nextDeckIndex}`,
        catalogTaskId: nextCatalogCard.id,
        text: nextCatalogCard.text,
        ownerPlayerId: instance.ownerPlayerId,
        status: 'active',
        completedByPlayerId: null,
        guessedByPlayerId: null,
        assignedAt: new Date().toISOString(),
        resolvedAt: null,
      };
    }

    const updatedInstances = [...cardInstances];
    updatedInstances[instanceIndex] = updatedCard;
    if (newCard) {
      updatedInstances.push(newCard);
    }

    // Update player scores
    const updatedPlayers = players.map((p) => {
      if (p.id === instance.ownerPlayerId && status === 'completed') {
        return {
          ...p,
          score: (p.score || 0) + 1,
        };
      }
      return p;
    });

    // Persist changes
    localStorage.setItem('wt_host_card_instances', JSON.stringify(updatedInstances));
    localStorage.setItem('wt_host_players', JSON.stringify(updatedPlayers));

    const hostId = get().sessionPlayerId;
    const hostCards = updatedInstances.filter(c => c.ownerPlayerId === hostId && c.status === 'active');
    const hostResolvedCards = updatedInstances.filter(c => c.ownerPlayerId === hostId && c.status !== 'active');
    const hostInstancesCount = updatedInstances.filter(c => c.ownerPlayerId === hostId).length;

    if (hostId === instance.ownerPlayerId) {
      localStorage.setItem('wt_player_cards_drawn', hostInstancesCount.toString());
      localStorage.setItem('wt_player_my_cards', JSON.stringify(hostCards));
      localStorage.setItem('wt_player_resolved_cards', JSON.stringify(hostResolvedCards));
    }

    set({
      cardInstances: updatedInstances,
      players: updatedPlayers,
      myCards: hostCards,
      resolvedCards: hostResolvedCards,
      cardsDrawn: hostId === instance.ownerPlayerId ? hostInstancesCount : get().cardsDrawn,
    });

    return {
      updatedCard,
      newCard,
      updatedPlayers,
    };
  },
}));
