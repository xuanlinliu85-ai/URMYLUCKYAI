import type { PokerRules, SquidRules } from "@/types/game";

export const DEFAULT_POKER_RULES: PokerRules = {
  maxPlayers: 7,
  maxHands: 10,
  startingStack: 10_000,
  smallBlind: 50,
  bigBlind: 100,
  actionSeconds: 30,
  nextHandDelaySeconds: 5
};

export const SQUID_OFF: SquidRules = {
  enabled: false,
  eligibility: "MAIN_POT_AND_SHOW",
  mode: "FINITE",
  squidValue: 500,
  ending: "LAST_PLAYER_WITHOUT_SQUID",
  totalSquidFormula: "UNTIL_ONE_UNSAFE",
  extraSquids: 0,
  firstPotReward: 1,
  splitPotCarryOver: false,
  maxCarryOver: 4,
  settlement: "FLAT_PER_SAFE_PLAYER",
  multiplierRules: []
};

export const CLASSIC_SQUID: SquidRules = { ...SQUID_OFF, enabled: true };

export const PROGRESSIVE_SQUID: SquidRules = {
  ...CLASSIC_SQUID,
  mode: "PROGRESSIVE",
  ending: "TOTAL_SQUIDS",
  totalSquidFormula: "PLAYER_COUNT_PLUS_X",
  extraSquids: 3,
  firstPotReward: 2,
  splitPotCarryOver: true,
  settlement: "PER_SQUID",
  multiplierRules: [
    { threshold: 3, multiplier: 2 },
    { threshold: 5, multiplier: 3 },
    { threshold: 7, multiplier: 4 }
  ]
};
