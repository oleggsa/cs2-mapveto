import type { Match, Profile } from '../types'

export function isPrivileged(match: Match, me: Profile): boolean {
  return match.created_by === me.id || me.is_admin
}
