import { useSession } from './hooks/useSession'
import { useHashRoute, matchRoomPath, matchPlayerPath } from './hooks/useHashRoute'
import { Home } from './pages/Home'
import { Room } from './pages/Room'
import { Player } from './pages/Player'
import { UserBadge } from './components/UserBadge'
import './App.css'

export default function App() {
  const [path, navigate] = useHashRoute()
  const { session, profile, loading } = useSession()

  const roomId = matchRoomPath(path)
  const playerId = matchPlayerPath(path)

  return (
    <>
      {profile && <UserBadge profile={profile} />}
      {(roomId || playerId) && (
        <button className="home-btn" onClick={() => navigate('/')} title="На главную">
          ← Главная
        </button>
      )}
      {roomId ? (
        <Room
          roomId={roomId}
          session={session}
          profile={profile}
          sessionLoading={loading}
          onLeftRoom={() => navigate('/')}
        />
      ) : playerId ? (
        <Player playerId={playerId} />
      ) : (
        <Home session={session} profile={profile} onCreated={(id) => navigate(`/room/${id}`)} />
      )}
    </>
  )
}
