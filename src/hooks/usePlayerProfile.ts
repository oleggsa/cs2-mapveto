import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, PlayerMatchItem, Profile, Team, TournamentListItem } from '../types'

interface PlayerData {
  profile: Profile | null
  matches: PlayerMatchItem[]
  tournaments: TournamentListItem[]
  loading: boolean
}

export function usePlayerProfile(playerId: string) {
  const [state, setState] = useState<PlayerData>({
    profile: null,
    matches: [],
    tournaments: [],
    loading: true,
  })

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))

    const [{ data: profile }, { data: seats }, { data: organized }, { data: seated }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', playerId).maybeSingle(),
      supabase.from('match_players').select('team, match:matches(*)').eq('player_id', playerId),
      supabase
        .from('tournaments')
        .select('*, creator:profiles!tournaments_created_by_fkey(name)')
        .eq('created_by', playerId),
      supabase.from('tournament_players').select('tournament_id').eq('player_id', playerId),
    ])

    const rows = (seats ?? []) as unknown as { team: Team; match: Match | null }[]
    const matches = rows
      .filter((r) => r.match && r.match.status !== 'cancelled')
      .map((r) => ({ ...r.match!, myTeam: r.team }) as PlayerMatchItem)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const seatedTournamentIds = (seated ?? []).map((r) => r.tournament_id)
    const organizedIds = new Set((organized ?? []).map((t) => t.id))
    const extraIds = seatedTournamentIds.filter((id) => !organizedIds.has(id))

    const { data: extraTournaments } = extraIds.length
      ? await supabase
          .from('tournaments')
          .select('*, creator:profiles!tournaments_created_by_fkey(name)')
          .in('id', extraIds)
      : { data: [] }

    const tournaments = [...(organized ?? []), ...(extraTournaments ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ) as TournamentListItem[]

    setState({ profile: (profile as Profile) ?? null, matches, tournaments, loading: false })
  }, [playerId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { ...state, refetch }
}
