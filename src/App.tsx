import { useSession } from './hooks/useSession'
import { useHashRoute, matchRoomPath } from './hooks/useHashRoute'
import { Home } from './pages/Home'
import { Room } from './pages/Room'
import { UserBadge } from './components/UserBadge'
import './App.css'

export default function App() {
  const [path, navigate] = useHashRoute()
  const { session, profile, loading } = useSession()

  const roomId = matchRoomPath(path)

  return (
    <>
      {profile && <UserBadge profile={profile} />}
      {roomId ? (
        <Room
          roomId={roomId}
          session={session}
          profile={profile}
          sessionLoading={loading}
          onLeftRoom={() => navigate('/')}
        />
      ) : (
        <Home session={session} profile={profile} onCreated={(id) => navigate(`/room/${id}`)} />
      )}
    </>
  )
}
