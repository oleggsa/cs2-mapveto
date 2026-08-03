import type { Match, Team } from '../types'

export function teamSuffix(match: Match, team: Team): string {
  return (team === 'A' ? match.team_a_name : match.team_b_name) || team
}

export function teamLabel(match: Match, team: Team): string {
  return `Команда ${teamSuffix(match, team)}`
}
