import type { RoomPublicState } from "@/types/game";
import { CLASSIC_SQUID, DEFAULT_POKER_RULES } from "@/config/presets";

export const mockTableState: Partial<RoomPublicState> = {
  roomCode: "888888",
  stateVersion: 24,
  rules: { roomId: "mock-room", version: 1, createdAt: 0, poker: DEFAULT_POKER_RULES, squid: CLASSIC_SQUID }
};
