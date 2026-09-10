import { randomUUID } from "node:crypto";
import type { HandResult, SquidRules, SquidSettlement, SquidState } from "@/types/game";

function totalSquids(rules: SquidRules, playerCount: number): number | undefined {
  if (rules.totalSquidFormula === "PLAYER_COUNT") return playerCount;
  if (rules.totalSquidFormula === "PLAYER_COUNT_PLUS_X") return playerCount + rules.extraSquids;
  return undefined;
}

export function createSquidRound(participantIds: string[], rules: SquidRules, roundNo = 1): SquidState {
  return {
    enabled: rules.enabled,
    roundId: randomUUID(),
    roundNo,
    participantIds: [...participantIds],
    mode: rules.mode,
    squidValue: rules.squidValue,
    remainingSquids: totalSquids(rules, participantIds.length),
    currentHandReward: 1,
    players: Object.fromEntries(participantIds.map((playerId) => [playerId, {
      playerId, squidCount: 0, safe: false, squidProfit: 0, totalSquidWon: 0
    }])),
    status: "ACTIVE",
    processedHandIds: [],
    awards: [],
    settlements: []
  };
}

function shouldEnd(state: SquidState, rules: SquidRules): boolean {
  const unsafeCount = state.participantIds.filter((id) => state.players[id]?.squidCount === 0).length;
  if (rules.ending === "LAST_PLAYER_WITHOUT_SQUID") return unsafeCount <= 1;
  return (state.remainingSquids ?? Number.POSITIVE_INFINITY) <= 0;
}

function applicableMultiplier(count: number, rules: SquidRules): number {
  return rules.multiplierRules
    .filter((rule) => count >= rule.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0]?.multiplier ?? 1;
}

export function calculateSquidSettlement(state: SquidState, rules: SquidRules): SquidSettlement[] {
  const unsafe = state.participantIds.filter((id) => state.players[id]?.squidCount === 0);
  const safe = state.participantIds.filter((id) => (state.players[id]?.squidCount ?? 0) > 0);
  return unsafe.flatMap((fromPlayerId) => safe.map((toPlayerId) => {
    const squidCount = state.players[toPlayerId].squidCount;
    const unitCount = rules.settlement === "PER_SQUID" ? squidCount : 1;
    const multiplier = rules.settlement === "PER_SQUID" ? applicableMultiplier(squidCount, rules) : 1;
    return {
      squidRoundId: state.roundId,
      fromPlayerId,
      toPlayerId,
      squidCount,
      baseValue: rules.squidValue,
      multiplier,
      amount: unitCount * rules.squidValue * multiplier
    };
  }));
}

function settle(state: SquidState, rules: SquidRules): void {
  state.status = "SETTLING";
  state.settlements = calculateSquidSettlement(state, rules);
  state.settlements.forEach((entry) => {
    state.players[entry.fromPlayerId].squidProfit -= entry.amount;
    state.players[entry.toPlayerId].squidProfit += entry.amount;
  });
}

export interface SquidProcessResult {
  state: SquidState;
  awardedPlayerId?: string;
  awardAmount: number;
  roundEnded: boolean;
  duplicate: boolean;
}

export function showDecisionWinner(hand: HandResult, rules: SquidRules): string | undefined {
  if (!rules.enabled || rules.eligibility !== "MAIN_POT_AND_SHOW") return undefined;
  if (hand.wasMainPotSplit || hand.mainPotWinners.length !== 1) return undefined;
  const winnerId = hand.mainPotWinners[0];
  return hand.revealedPlayers.includes(winnerId) ? undefined : winnerId;
}

export function processHandResult(stateInput: SquidState, hand: HandResult, rules: SquidRules): SquidProcessResult {
  const state = structuredClone(stateInput);
  if (!state.enabled || state.status !== "ACTIVE") return { state, awardAmount: 0, roundEnded: false, duplicate: false };
  if (state.processedHandIds.includes(hand.handId)) return { state, awardAmount: 0, roundEnded: false, duplicate: true };
  state.processedHandIds.push(hand.handId);

  if (hand.wasMainPotSplit || hand.mainPotWinners.length !== 1) {
    if (rules.splitPotCarryOver) state.currentHandReward = Math.min(state.currentHandReward + 1, rules.maxCarryOver);
    return { state, awardAmount: 0, roundEnded: false, duplicate: false };
  }

  const winnerId = hand.mainPotWinners[0];
  const participant = state.players[winnerId];
  const showSatisfied = rules.eligibility === "MAIN_POT_ANY_WIN" || hand.revealedPlayers.includes(winnerId);
  if (!participant || !showSatisfied) return { state, awardAmount: 0, roundEnded: false, duplicate: false };

  const isFirstAward = state.awards.length === 0;
  const baseReward = isFirstAward ? rules.firstPotReward : 1;
  const awardAmount = Math.max(baseReward, state.currentHandReward);
  participant.squidCount += awardAmount;
  participant.safe = true;
  participant.totalSquidWon += awardAmount;
  if (state.remainingSquids !== undefined) state.remainingSquids = Math.max(0, state.remainingSquids - awardAmount);
  state.awards.push({
    squidRoundId: state.roundId,
    handId: hand.handId,
    playerId: winnerId,
    amount: awardAmount,
    reason: state.currentHandReward > 1 ? "CARRY_OVER" : isFirstAward && rules.firstPotReward > 1 ? "FIRST_POT_BONUS" : rules.eligibility === "MAIN_POT_ANY_WIN" ? "MAIN_POT_AUTO" : "MAIN_POT_SHOW",
    timestamp: Date.now()
  });
  state.currentHandReward = 1;
  const roundEnded = shouldEnd(state, rules);
  if (roundEnded) settle(state, rules);
  return { state, awardedPlayerId: winnerId, awardAmount, roundEnded, duplicate: false };
}

export function finishSquidSettlement(stateInput: SquidState): SquidState {
  const state = structuredClone(stateInput);
  if (state.status !== "SETTLING") throw new Error("Squid round is not settling");
  state.status = "FINISHED";
  return state;
}

export function nextSquidRound(state: SquidState, rules: SquidRules): SquidState {
  if (state.status !== "FINISHED" && state.status !== "SETTLING") throw new Error("Current squid round is still active");
  const next = createSquidRound(state.participantIds, rules, state.roundNo + 1);
  next.participantIds.forEach((playerId) => {
    next.players[playerId].totalSquidWon = state.players[playerId]?.totalSquidWon ?? 0;
  });
  return next;
}
