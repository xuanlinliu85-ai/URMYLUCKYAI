export function potFractionAmount(pot: number, numerator: number, denominator: number, minimum: number, maximum: number, callAmount = 0, currentStreetBet = 0): number {
  const raw = currentStreetBet + callAmount + Math.round((pot + callAmount) * numerator / denominator);
  return Math.min(maximum, Math.max(minimum, raw));
}
