import type { Match, Profile, Tournament } from '../types'

export function isPrivileged(match: Match, me: Profile | null): boolean {
  if (!me) return false
  return match.created_by === me.id || me.is_admin
}

export function isPrivilegedTournament(tournament: Tournament, me: Profile | null): boolean {
  if (!me) return false
  return tournament.created_by === me.id || me.is_admin
}
