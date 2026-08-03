import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, MatchPlayer, MatchRound, MatchVote } from '../types'

interface MatchData {
  match: Match | null
  players: MatchPlayer[]
  rounds: MatchRound[]
  votes: MatchVote[]
  loading: boolean
}

export function useMatch(matchId: string) {
  const [state, setState] = useState<MatchData>({
    match: null,
    players: [],
    rounds: [],
    votes: [],
    loading: true,
  })

  const refetch = useCallback(async () => {
    const [{ data: match }, { data: players }, { data: rounds }] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
      supabase
        .from('match_players')
        .select('*, profile:profiles(*)')
        .eq('match_id', matchId)
        .order('team')
        .order('slot'),
      supabase.from('match_rounds').select('*').eq('match_id', matchId).order('round_no'),
    ])

    const roundIds = (rounds ?? []).map((r) => r.id)
    const { data: votes } = roundIds.length
      ? await supabase.from('match_votes').select('*').in('round_id', roundIds)
      : { data: [] }

    setState({
      match: (match as Match) ?? null,
      players: (players as unknown as MatchPlayer[]) ?? [],
      rounds: (rounds as MatchRound[]) ?? [],
      votes: (votes as MatchVote[]) ?? [],
      loading: false,
    })
  }, [matchId])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_rounds', filter: `match_id=eq.${matchId}` },
        refetch,
      )
      // match_votes has no match_id column to filter on directly; dataset is tiny (<=5 rows
      // per round) so we just refetch everything on any vote insert.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_votes' }, refetch)
      .subscribe()

    // Realtime can silently drop (e.g. websocket hiccups on a backgrounded
    // tab), which would otherwise leave the UI stuck until a manual reload —
    // a cheap poll keeps it eventually consistent regardless.
    const pollId = setInterval(refetch, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollId)
    }
  }, [matchId, refetch])

  return { ...state, refetch }
}
