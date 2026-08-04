import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tournament, TournamentMatch, TournamentPlayer, TournamentTeam } from '../types'

export type TournamentWithOrganizer = Tournament & { creator: { name: string } | null }

interface TournamentData {
  tournament: TournamentWithOrganizer | null
  teams: TournamentTeam[]
  players: TournamentPlayer[]
  matches: TournamentMatch[]
  loading: boolean
}

export function useTournament(tournamentId: string) {
  const [state, setState] = useState<TournamentData>({
    tournament: null,
    teams: [],
    players: [],
    matches: [],
    loading: true,
  })

  const refetch = useCallback(async () => {
    const [{ data: tournament }, { data: teams }, { data: players }, { data: matches }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('*, creator:profiles!tournaments_created_by_fkey(name)')
        .eq('id', tournamentId)
        .maybeSingle(),
      supabase.from('tournament_teams').select('*').eq('tournament_id', tournamentId).order('seed'),
      supabase
        .from('tournament_players')
        .select('*, profile:profiles(*)')
        .eq('tournament_id', tournamentId)
        .order('team_id')
        .order('slot'),
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('tournament_round_no')
        .order('tournament_board_no'),
    ])

    setState({
      tournament: (tournament as unknown as TournamentWithOrganizer) ?? null,
      teams: (teams as TournamentTeam[]) ?? [],
      players: (players as unknown as TournamentPlayer[]) ?? [],
      matches: (matches as TournamentMatch[]) ?? [],
      loading: false,
    })
  }, [tournamentId])

  useEffect(() => {
    refetch()

    const channel = supabase
      .channel(`tournament:${tournamentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${tournamentId}` },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_players', filter: `tournament_id=eq.${tournamentId}` },
        refetch,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        refetch,
      )
      .subscribe()

    const pollId = setInterval(refetch, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollId)
    }
  }, [tournamentId, refetch])

  return { ...state, refetch }
}
