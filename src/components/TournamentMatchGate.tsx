import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { teamLabel } from '../lib/teamNames'
import { PlayerLink } from './PlayerLink'
import type { Match, MatchPlayer, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  me: Profile | null
  onChanged: () => void
}

/** Shown for a tournament match waiting in 'scheduled' — both team captains
 * (whoever sits in slot 0) must mark their team ready before the veto starts. */
export function TournamentMatchGate({ match, players, me, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)

  const captainA = players.find((p) => p.team === 'A' && p.slot === 0)
  const captainB = players.find((p) => p.team === 'B' && p.slot === 0)
  const isCaptainA = !!captainA?.player_id && captainA.player_id === me?.id
  const isCaptainB = !!captainB?.player_id && captainB.player_id === me?.id

  async function toggleReady() {
    setToggling(true)
    setError(null)
    const { error } = await supabase.rpc('toggle_tournament_ready', { p_match_id: match.id })
    setToggling(false)
    if (error) setError(error.message)
    else onChanged()
  }

  function renderTeam(team: Team) {
    const members = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    const ready = team === 'A' ? match.ready_a : match.ready_b
    const isMyCaptainSeat = team === 'A' ? isCaptainA : isCaptainB

    return (
      <div className="roster">
        <h3>{teamLabel(match, team)}</h3>
        {members.map((m) => (
          <div key={m.slot} className="roster-row">
            <PlayerLink playerId={m.player_id} className="roster-player-link">
              {m.profile?.avatar_url ? (
                <img className="roster-avatar" src={m.profile.avatar_url} alt="" />
              ) : (
                <span className="roster-avatar" />
              )}
              <span>{m.profile?.name ?? '—'}</span>
            </PlayerLink>
            {m.slot === 0 && (
              <span className="captain-tag" title="Капитан">
                👑
              </span>
            )}
          </div>
        ))}
        <div className={`ready-status ${ready ? 'ready-status--ready' : ''}`}>
          {ready ? 'Готовы' : 'Не готовы'}
        </div>
        {isMyCaptainSeat && (
          <button className="btn btn-sm" onClick={toggleReady} disabled={toggling}>
            {ready ? 'Отменить готовность' : 'Мы готовы'}
          </button>
        )}
      </div>
    )
  }

  const canToggle = isCaptainA || isCaptainB

  return (
    <div>
      <h2 className="round-heading">Ожидание готовности команд</h2>
      <p className="timer">Веб-вето начнётся, как только капитаны обеих команд подтвердят готовность.</p>

      <div className="gate-body">
        {renderTeam('A')}
        {renderTeam('B')}
      </div>

      {!canToggle && <p className="lobby-hint">Отметить готовность может капитан команды (первый слот состава).</p>}
      {error && <p className="lobby-hint" style={{ color: 'var(--ban)' }}>{error}</p>}
    </div>
  )
}
