import { useSession } from './hooks/useSession'
import { useHashRoute, matchRoomPath } from './hooks/useHashRoute'
import { Home } from './pages/Home'
import { Room } from './pages/Room'
import './App.css'

export default function App() {
  const [path, navigate] = useHashRoute()
  const { session, profile, loading } = useSession()

  const roomId = matchRoomPath(path)

  if (roomId) {
    return <Room roomId={roomId} session={session} profile={profile} sessionLoading={loading} />
  }

  return <Home session={session} onCreated={(id) => navigate(`/room/${id}`)} />
}
