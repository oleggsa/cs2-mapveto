import type { Session } from '@supabase/supabase-js'
import { useMatch } from '../hooks/useMatch'
import { Lobby } from '../components/Lobby'
import { VetoBoard } from '../components/VetoBoard'
import { ResultScreen } from '../components/ResultScreen'
import { RoomHeader } from '../components/RoomHeader'
import { steamAuthUrl } from '../lib/supabase'
import type { Profile } from '../types'

interface Props {
  roomId: string
  session: Session | null
  profile: Profile | null
  sessionLoading: boolean
  onLeftRoom: () => void
}

export function Room({ roomId, session, profile, sessionLoading, onLeftRoom }: Props) {
  const { match, players, rounds, votes, loading, refetch } = useMatch(roomId)

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
      <RoomHeader match={match} me={profile} roomId={roomId} onDeleted={onLeftRoom} onChanged={refetch} />

      {match.status === 'lobby' && (
        <Lobby match={match} players={players} me={profile} onChanged={refetch} />
      )}
      {match.status === 'veto' && (
        <VetoBoard match={match} players={players} rounds={rounds} votes={votes} me={profile} onChanged={refetch} />
      )}
      {match.status === 'done' && <ResultScreen match={match} me={profile} onChanged={refetch} />}
    </div>
  )
}
