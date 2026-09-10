export type Suit = "S" | "H" | "D" | "C";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Card = `${Rank}${Suit}`;

export type GameMode = "poker" | "poker_squid";
export type RoomStatus = "waiting" | "playing" | "paused" | "finished";
export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "RUNOUT_VOTE" | "SHOWDOWN" | "FINISHED";
export type PlayerStatus = "ACTIVE" | "FOLDED" | "ALL_IN" | "SITTING_OUT" | "DISCONNECTED_GRACE";
export type ActionType = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export interface PokerRules {
  maxPlayers: number;
  maxHands: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  actionSeconds: number;
  nextHandDelaySeconds: number;
}

export type SquidEligibility = "MAIN_POT_AND_SHOW" | "MAIN_POT_ANY_WIN";
export type SquidMode = "FINITE" | "PROGRESSIVE";
export type SquidEnding = "LAST_PLAYER_WITHOUT_SQUID" | "TOTAL_SQUIDS";
export type SquidSettlementMode = "FLAT_PER_SAFE_PLAYER" | "PER_SQUID";

export interface SquidRules {
  enabled: boolean;
  eligibility: SquidEligibility;
  mode: SquidMode;
  squidValue: number;
  ending: SquidEnding;
  totalSquidFormula: "PLAYER_COUNT" | "PLAYER_COUNT_PLUS_X" | "UNTIL_ONE_UNSAFE";
  extraSquids: number;
  firstPotReward: number;
  splitPotCarryOver: boolean;
  maxCarryOver: number;
  settlement: SquidSettlementMode;
  multiplierRules: { threshold: number; multiplier: number }[];
}

export interface RuleSnapshot {
  roomId: string;
  version: number;
  createdAt: number;
  poker: PokerRules;
  squid: SquidRules;
}

export interface PokerPlayerState {
  id: string;
  nickname: string;
  avatarId: string;
  seatNo: number;
  stack: number;
  status: PlayerStatus;
  streetBet: number;
  totalCommitted: number;
  acted: boolean;
  lastAction?: ActionType;
  holeCards?: [Card, Card];
}

export interface Pot {
  id: string;
  type: "MAIN" | "SIDE";
  amount: number;
  eligiblePlayerIds: string[];
  winnerIds: string[];
  splitAmounts: Record<string, number>;
}

export interface PokerAction {
  actionId: string;
  playerId: string;
  type: ActionType;
  amount?: number;
  at: number;
  stateVersion: number;
}

export interface RunoutVote {
  eligiblePlayerIds: string[];
  votes: Record<string, 1 | 2>;
}

export interface RunoutResult {
  board: Card[];
  potWinnerIds: Record<string, string[]>;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount?: number;
  canBet: boolean;
  minBet?: number;
  maxBet?: number;
  canRaise: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
}

export interface PokerState {
  handId: string;
  handNo: number;
  street: Street;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  players: PokerPlayerState[];
  board: Card[];
  deck: Card[];
  currentPlayerId?: string;
  currentBet: number;
  minRaise: number;
  pots: Pot[];
  actions: PokerAction[];
  processedActionIds: string[];
  raiseLockedPlayerIds: string[];
  startedAt: number;
  actionDeadline?: number;
  runoutVote?: RunoutVote;
  runoutCount?: 1 | 2;
  runoutBoards?: Card[][];
  runoutResults?: RunoutResult[];
  showDecisionPlayerId?: string;
  revealedHoleCards?: Record<string, [Card, Card]>;
}

export interface SquidPlayerState {
  playerId: string;
  squidCount: number;
  safe: boolean;
  squidProfit: number;
  totalSquidWon: number;
}

export interface SquidAwardLedger {
  squidRoundId: string;
  handId: string;
  playerId: string;
  amount: number;
  reason: "MAIN_POT_SHOW" | "MAIN_POT_AUTO" | "FIRST_POT_BONUS" | "CARRY_OVER";
  timestamp: number;
}

export interface SquidSettlement {
  squidRoundId: string;
  fromPlayerId: string;
  toPlayerId: string;
  squidCount: number;
  baseValue: number;
  multiplier: number;
  amount: number;
}

export interface SquidState {
  enabled: boolean;
  roundId: string;
  roundNo: number;
  participantIds: string[];
  mode: SquidMode;
  squidValue: number;
  remainingSquids?: number;
  currentHandReward: number;
  players: Record<string, SquidPlayerState>;
  status: "ACTIVE" | "SETTLING" | "FINISHED";
  processedHandIds: string[];
  awards: SquidAwardLedger[];
  settlements: SquidSettlement[];
}

export interface HandResult {
  handId: string;
  pots: Pot[];
  mainPotWinners: string[];
  sidePotWinners: string[];
  showdownPlayers: string[];
  revealedPlayers: string[];
  wasMainPotSplit: boolean;
  runoutBoards?: Card[][];
}

export interface RoomPublicState {
  roomId: string;
  roomCode: string;
  status: RoomStatus;
  hostPlayerId: string;
  stateVersion: number;
  rules: RuleSnapshot;
  members: Array<Omit<PokerPlayerState, "holeCards"> & { squidCount: number; totalSquidWon: number; connected: boolean; buyInTotal: number }>;
  poker?: Omit<PokerState, "deck" | "players"> & { players: Array<Omit<PokerPlayerState, "holeCards">> };
  squid?: SquidState;
}

export interface PlayerPrivateState {
  playerId: string;
  holeCards?: [Card, Card];
  legalActions?: LegalActions;
}

export interface SyncPayload {
  publicState: RoomPublicState;
  privateState: PlayerPrivateState;
  stateVersion: number;
}

export interface PlayerActionRequest {
  roomCode: string;
  playerToken: string;
  actionId: string;
  handId: string;
  stateVersion: number;
  action: { type: ActionType; amount?: number };
}

export interface PlayerNightSummary {
  playerId: string;
  nickname: string;
  pokerProfit: number;
  squidProfit: number;
  totalProfit: number;
  handsPlayed: number;
  handsWon: number;
  squidRounds: number;
  squidEarned: number;
}
