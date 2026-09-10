import type { PokerState, SquidState } from "@/types/game";

export interface RuntimeSnapshot {
  roomId: string;
  stateVersion: number;
  poker: PokerState;
  squid: SquidState;
}

export interface GameStateRepository {
  load(roomCode: string): Promise<RuntimeSnapshot>;
  compareAndSwap(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<number>;
}

export interface RealtimeTransport {
  publish(roomCode: string, event: string, stateVersion: number): Promise<void>;
}

export interface PresenceProvider {
  connectedPlayerIds(roomCode: string): Promise<string[]>;
}
