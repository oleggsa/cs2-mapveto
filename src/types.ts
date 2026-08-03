export type Team = 'A' | 'B'
export type MatchStatus = 'lobby' | 'veto' | 'done'
export type RoundKind = 'ban' | 'pick_map' | 'pick_side'
export type ResolvedBy = 'majority' | 'random'

export interface Profile {
  id: string
  steam_id: string
  name: string
  avatar_url: string | null
  is_admin: boolean
  faceit_level: number | null
  faceit_elo: number | null
}

export interface Match {
  id: string
  created_by: string
  status: MatchStatus
  map_pool: string[]
  name: string | null
  team_a_name: string | null
  team_b_name: string | null
  final_map: string | null
  starting_side: 'CT' | 'T' | null
  score_a: number | null
  score_b: number | null
  created_at: string
}

export interface MatchListItem extends Match {
  creator: { name: string } | null
  filled: number
}

export interface PlayerMatchItem extends Match {
  myTeam: Team
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
  pick_count: number
  deadline: string
  resolved: boolean
  results: string[]
  resolved_by: ResolvedBy | null
}

export interface MatchVote {
  round_id: string
  player_id: string
  choice: string
}
