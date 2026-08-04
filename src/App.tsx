import { useState } from 'react'
import { useSession } from './hooks/useSession'
import { useHashRoute, matchRoomPath, matchPlayerPath, matchTournamentPath } from './hooks/useHashRoute'
import { supabase, steamAuthUrl } from './lib/supabase'
import { MAP_POOL_CODES } from './config/mapPool'
import { Home } from './pages/Home'
import { Room } from './pages/Room'
import { Player } from './pages/Player'
import { TournamentRoom } from './pages/TournamentRoom'
import { UserBadge } from './components/UserBadge'
import { CreateMenu } from './components/CreateMenu'
import { CreateTournamentModal } from './components/CreateTournamentModal'
import { SteamIcon } from './components/SteamIcon'
import './App.css'

export default function App() {
  const [path, navigate] = useHashRoute()
  const { session, profile, loading } = useSession()
  const [showTournamentModal, setShowTournamentModal] = useState(false)
  const [creatingMatch, setCreatingMatch] = useState(false)

  const roomId = matchRoomPath(path)
  const playerId = matchPlayerPath(path)
  const tournamentId = matchTournamentPath(path)
  const isHome = !roomId && !playerId && !tournamentId

  async function createMatch() {
    setCreatingMatch(true)
    const { data, error } = await supabase.rpc('create_match', { p_map_pool: MAP_POOL_CODES })
    setCreatingMatch(false)
    if (error) {
      console.error(error)
      return
    }
    navigate(`/room/${data}`)
  }

  return (
    <>
      <div className="app-header">
        <div className="app-header-left">
          {(roomId || playerId || tournamentId) && (
            <button className="home-btn" onClick={() => navigate('/')} title="На главную">
              ← Главная
            </button>
          )}
        </div>
        <div className="app-header-right">
          {profile && isHome && (
            <CreateMenu
              onSelectMatch={createMatch}
              onSelectTournament={() => setShowTournamentModal(true)}
              disabled={creatingMatch}
            />
          )}
          {profile && <UserBadge profile={profile} />}
          {!loading && !profile && !isHome && (
            <a className="btn btn-steam btn-sm" href={steamAuthUrl(path)}>
              <SteamIcon size={16} />
              Войти
            </a>
          )}
        </div>
      </div>

      {showTournamentModal && (
        <CreateTournamentModal
          onCreated={(id) => {
            setShowTournamentModal(false)
            navigate(`/tournament/${id}`)
          }}
          onCancel={() => setShowTournamentModal(false)}
        />
      )}

      {roomId ? (
        <Room
          roomId={roomId}
          session={session}
          profile={profile}
          sessionLoading={loading}
          onLeftRoom={() => navigate('/')}
        />
      ) : tournamentId ? (
        <TournamentRoom
          tournamentId={tournamentId}
          session={session}
          profile={profile}
          sessionLoading={loading}
          onLeftRoom={() => navigate('/')}
        />
      ) : playerId ? (
        <Player playerId={playerId} session={session} />
      ) : (
        <Home session={session} profile={profile} />
      )}
    </>
  )
}
