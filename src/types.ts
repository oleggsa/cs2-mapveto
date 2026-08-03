export type Team = 'A' | 'B'
export type MatchStatus = 'lobby' | 'veto' | 'done'
export type RoundKind = 'ban' | 'pick_map' | 'pick_side'
export type ResolvedBy = 'majority' | 'random'

export interface Profile {
  id: string
  steam_id: string
  name: string
  avatar_url: string | null
}

export interface Match {
  id: string
  created_by: string
  status: MatchStatus
  map_pool: string[]
  final_map: string | null
  starting_side: 'CT' | 'T' | null
  created_at: string
}

export interface MatchPlayer {
  match_id: string
  team: Team
  slot: number
  player_id: string | null
  profile?: Profile | null
}

export interface MatchRound {
  id: string
  match_id: string
  round_no: number
  kind: RoundKind
  team: Team
  options: string[]
  deadline: string
  resolved: boolean
  result: string | null
  resolved_by: ResolvedBy | null
}

export interface MatchVote {
  round_id: string
  player_id: string
  choice: string
}
