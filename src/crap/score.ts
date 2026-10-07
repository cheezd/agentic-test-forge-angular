export function crapScore(complexity: number, coverage: number): number {
  const fraction = Math.min(1, Math.max(0, coverage));
  return complexity * complexity * (1 - fraction) ** 3 + complexity;
}

export function isAboveCeiling(score: number, ceiling: number): boolean {
  return score > ceiling;
}
