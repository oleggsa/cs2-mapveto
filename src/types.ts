export type Team = 'A' | 'B'
export type MatchStatus = 'lobby' | 'veto' | 'scheduled' | 'done' | 'cancelled'
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
  tournament_id: string | null
  tournament_round_no: number | null
  tournament_board_no: number | null
  tournament_team_a_id: string | null
  tournament_team_b_id: string | null
  ready_a: boolean
  ready_b: boolean
}

export interface MatchListItem extends Match {
  creator: { name: string } | null
  filled: number
  myTeam: Team | null
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

export type TournamentStatus = 'lobby' | 'in_progress' | 'done' | 'cancelled'

export interface Tournament {
  id: string
  created_by: string
  name: string | null
  game: string
  format: 'round_robin'
  status: TournamentStatus
  map_pool: string[]
  start_time: string | null
  created_at: string
}

export interface TournamentListItem extends Tournament {
  creator: { name: string } | null
}

export interface TournamentTeam {
  id: string
  tournament_id: string
  seed: number
  name: string
}

export interface TournamentPlayer {
  tournament_id: string
  team_id: string
  slot: number
  player_id: string | null
  profile?: Profile | null
}

/** One round-robin game — a regular Match, placed on the bracket. */
export interface TournamentMatch extends Match {
  tournament_round_no: number
  tournament_board_no: number
  tournament_team_a_id: string
  tournament_team_b_id: string
}
