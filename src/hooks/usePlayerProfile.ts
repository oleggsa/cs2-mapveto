import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, PlayerMatchItem, Profile, Team } from '../types'

interface PlayerData {
  profile: Profile | null
  matches: PlayerMatchItem[]
  loading: boolean
}

export function usePlayerProfile(playerId: string) {
  const [state, setState] = useState<PlayerData>({ profile: null, matches: [], loading: true })

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))

    const [{ data: profile }, { data: seats }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', playerId).maybeSingle(),
      supabase.from('match_players').select('team, match:matches(*)').eq('player_id', playerId),
    ])

    const rows = (seats ?? []) as unknown as { team: Team; match: Match | null }[]
    const matches = rows
      .filter((r) => r.match)
      .map((r) => ({ ...r.match!, myTeam: r.team }) as PlayerMatchItem)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setState({ profile: (profile as Profile) ?? null, matches, loading: false })
  }, [playerId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { ...state, refetch }
}
