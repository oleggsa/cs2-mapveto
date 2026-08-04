/** Consistent per-team color across the bracket and standings, keyed by team seed (1..4). */
export function bracketColor(seed: number): string {
  return `var(--bracket-${((seed - 1) % 4) + 1})`
}
