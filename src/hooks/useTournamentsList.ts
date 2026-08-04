import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TournamentListItem } from '../types'
import type { StatusFilter } from './useMatchesList'

export function useTournamentsList(statusFilter: StatusFilter, meId: string) {
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)

    if (!meId) {
      setTournaments([])
      setLoading(false)
      return
    }

    let query = supabase
      .from('tournaments')
      .select('*, creator:profiles!tournaments_created_by_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter === 'completed') {
      query = query.in('status', ['done', 'cancelled'])
    } else if (statusFilter === 'active') {
      query = query.in('status', ['lobby', 'in_progress'])
    }

    const [{ data: rows }, { data: seated }] = await Promise.all([
      query,
      supabase.from('tournament_players').select('tournament_id').eq('player_id', meId),
    ])

    const seatedIds = new Set((seated ?? []).map((r) => r.tournament_id))
    const list = ((rows ?? []) as TournamentListItem[]).filter(
      (t) => t.created_by === meId || seatedIds.has(t.id),
    )

    setTournaments(list.slice(0, 10))
    setLoading(false)
  }, [statusFilter, meId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { tournaments, loading, refetch }
}
