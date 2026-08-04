import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MatchListItem } from '../types'

export type StatusFilter = 'all' | 'active' | 'completed'
export type ScopeFilter = 'all' | 'mine'

export function useMatchesList(statusFilter: StatusFilter, scopeFilter: ScopeFilter, meId: string) {
  const [matches, setMatches] = useState<MatchListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)

    // Scoping to "mine" needs a larger pool to filter down from, since the
    // match might not be among the 10 most recent overall.
    const fetchLimit = scopeFilter === 'mine' ? 50 : 10

    let query = supabase
      .from('matches')
      .select('*, creator:profiles!matches_created_by_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(fetchLimit)

    if (statusFilter === 'completed') {
      query = query.in('status', ['done', 'cancelled'])
    } else if (statusFilter === 'active') {
      query = query.in('status', ['lobby', 'veto', 'scheduled'])
    }

    const { data: rows } = await query
    const matchIds = (rows ?? []).map((m) => m.id)

    const filledByMatch = new Map<string, number>()
    const seatedMatchIds = new Set<string>()
    if (matchIds.length) {
      const { data: players } = await supabase
        .from('match_players')
        .select('match_id, player_id')
        .in('match_id', matchIds)
      for (const p of players ?? []) {
        if (!p.player_id) continue
        filledByMatch.set(p.match_id, (filledByMatch.get(p.match_id) ?? 0) + 1)
        if (p.player_id === meId) seatedMatchIds.add(p.match_id)
      }
    }

    let list = (rows ?? []).map((m) => ({ ...m, filled: filledByMatch.get(m.id) ?? 0 }) as MatchListItem)
    if (scopeFilter === 'mine') {
      // A tournament match's created_by is always the tournament's organizer,
      // not necessarily someone actually playing in that specific game — only
      // roster seating tells us that. created_by only means "mine" for a
      // standalone match the viewer created themselves.
      list = list.filter(
        (m) => seatedMatchIds.has(m.id) || (!m.tournament_id && m.created_by === meId),
      )
    }

    setMatches(list.slice(0, 10))
    setLoading(false)
  }, [statusFilter, scopeFilter, meId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { matches, loading, refetch }
}
