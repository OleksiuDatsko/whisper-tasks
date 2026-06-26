export interface CatalogCard {
  id: string;
  text: string;
  isActive: boolean;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CardInstance {
  instanceId: string;
  catalogTaskId: string;
  text: string;
  ownerPlayerId: string;
  status: 'active' | 'completed' | 'guessed';
  completedByPlayerId: string | null;
  guessedByPlayerId: string | null;
  assignedAt: string;
  resolvedAt: string | null;
}

export interface Player {
  id: string; // Persistent Player ID (session token)
  peerId: string; // Current WebRTC Peer ID address
  name: string;
  isConnected: boolean;
  cardCount: number;
  isHost?: boolean;
  score: number;
}

export type GameStatus = 'lobby' | 'playing';

export type GameRole = 'host' | 'player';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface OfflineAction {
  type: 'complete' | 'guess';
  cardInstanceId: string;
  completedByPlayerId?: string;
}

// WebRTC Message Protocols
export type GameMessage =
  | { type: 'join_room'; payload: { name: string; playerId: string } }
  | { type: 'state_snapshot'; payload: { roomId: string; players: Player[]; myCards: CardInstance[]; resolvedCards: CardInstance[]; gameStatus: GameStatus } }
  | { type: 'mark_card_completed'; payload: { instanceId: string; completedByPlayerId: string } }
  | { type: 'mark_card_guessed'; payload: { instanceId: string } }
  | { type: 'card_updated'; payload: { card: CardInstance } }
  | { type: 'new_card_assigned'; payload: { card: CardInstance } }
  | { type: 'players_updated'; payload: { players: Player[] } }
  | { type: 'game_started'; payload: { status: GameStatus } };
