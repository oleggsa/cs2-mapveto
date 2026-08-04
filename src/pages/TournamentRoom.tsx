import type { Session } from '@supabase/supabase-js'
import { useTournament } from '../hooks/useTournament'
import { TournamentHeader } from '../components/TournamentHeader'
import { TournamentLobby } from '../components/TournamentLobby'
import { TournamentBracket } from '../components/TournamentBracket'
import { TournamentAdminRoster } from '../components/TournamentAdminRoster'
import { steamAuthUrl } from '../lib/supabase'
import type { Profile } from '../types'

interface Props {
  tournamentId: string
  session: Session | null
  profile: Profile | null
  sessionLoading: boolean
  onLeftRoom: () => void
}

export function TournamentRoom({ tournamentId, session, profile, sessionLoading, onLeftRoom }: Props) {
  const { tournament, teams, players, matches, loading, refetch } = useTournament(tournamentId)

  if (loading || sessionLoading) {
    return (
      <div className="page">
        <p>Загрузка…</p>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="center-card">
        <h1>Турнир не найден</h1>
      </div>
    )
  }

  if (!session || !profile) {
    return (
      <div className="center-card">
        <h1>{tournament.name || `Турнир #${tournamentId.slice(0, 8)}`}</h1>
        <p>Войдите через Steam, чтобы присоединиться.</p>
        <a className="btn btn-steam" href={steamAuthUrl('')}>
          Войти через Steam
        </a>
      </div>
    )
  }

  return (
    <div className="page">
      <TournamentHeader
        tournament={tournament}
        teams={teams}
        players={players}
        me={profile}
        tournamentId={tournamentId}
        onDeleted={onLeftRoom}
        onChanged={refetch}
      />

      {profile.is_admin && tournament.status !== 'lobby' && (
        <TournamentAdminRoster
          tournamentId={tournamentId}
          teams={teams}
          players={players}
          onChanged={refetch}
        />
      )}

      {tournament.status === 'lobby' && (
        <TournamentLobby tournament={tournament} teams={teams} players={players} me={profile} onChanged={refetch} />
      )}
      {tournament.status !== 'lobby' && (
        <TournamentBracket teams={teams} matches={matches} players={players} />
      )}
    </div>
  )
}
