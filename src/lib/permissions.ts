import type { Match, Profile, Tournament } from '../types'

export function isPrivileged(match: Match, me: Profile): boolean {
  return match.created_by === me.id || me.is_admin
}

export function isPrivilegedTournament(tournament: Tournament, me: Profile): boolean {
  return tournament.created_by === me.id || me.is_admin
}
