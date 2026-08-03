import type { Session } from '@supabase/supabase-js'
import { useMatch } from '../hooks/useMatch'
import { Lobby } from '../components/Lobby'
import { VetoBoard } from '../components/VetoBoard'
import { ResultScreen } from '../components/ResultScreen'
import { steamAuthUrl } from '../lib/supabase'
import type { Profile } from '../types'

interface Props {
  roomId: string
  session: Session | null
  profile: Profile | null
  sessionLoading: boolean
}

export function Room({ roomId, session, profile, sessionLoading }: Props) {
  const { match, players, rounds, votes, loading } = useMatch(roomId)

  if (loading || sessionLoading) {
    return (
      <div className="page">
        <p>Загрузка…</p>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="center-card">
        <h1>Матч не найден</h1>
      </div>
    )
  }

  if (!session || !profile) {
    return (
      <div className="center-card">
        <h1>Матч #{roomId.slice(0, 8)}</h1>
        <p>Войдите через Steam, чтобы присоединиться.</p>
        <a className="btn btn-steam" href={steamAuthUrl(roomId)}>
          Войти через Steam
        </a>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="room-header">
        <h1>Матч #{roomId.slice(0, 8)}</h1>
        <span className="room-link">{window.location.href}</span>
      </div>

      {match.status === 'lobby' && <Lobby matchId={roomId} players={players} me={profile} />}
      {match.status === 'veto' && (
        <VetoBoard match={match} players={players} rounds={rounds} votes={votes} me={profile} />
      )}
      {match.status === 'done' && <ResultScreen match={match} />}
    </div>
  )
}
