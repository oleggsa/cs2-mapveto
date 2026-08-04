import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivileged } from '../lib/permissions'
import { mapByCode } from '../config/mapPool'
import { teamLabel } from '../lib/teamNames'
import { PlayerLink } from './PlayerLink'
import type { Match, MatchPlayer, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  me: Profile | null
  onChanged: () => void
}

function clampScore(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 2)
  if (digits === '') return ''
  return String(Math.min(50, Number(digits)))
}

/** Same roster | card | roster layout as ResultScreen, but with a
 * placeholder in place of the map — a cancelled match still shows who was
 * seated, just without a result. The host or a super-admin can undo the
 * cancellation and record a real result via `restore_cancelled_match`. */
export function CancelledMatch({ match, players, me, onChanged }: Props) {
  const canManage = isPrivileged(match, me)
  const [restoring, setRestoring] = useState(false)
  const [map, setMap] = useState(match.map_pool[0])
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startRestoring() {
    setMap(match.map_pool[0])
    setScoreA('')
    setScoreB('')
    setError(null)
    setRestoring(true)
  }

  async function restore() {
    const a = Number(scoreA)
    const b = Number(scoreB)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 50 || b > 50) return
    setSaving(true)
    setError(null)
    const { error } = await supabase.rpc('restore_cancelled_match', {
      p_match_id: match.id,
      p_final_map: map,
      p_score_a: a,
      p_score_b: b,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setRestoring(false)
    onChanged()
  }

  function renderRoster(team: Team) {
    const members = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
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
            {match.tournament_id && m.slot === 0 && m.player_id && (
              <span className="captain-tag" title="Капитан">
                👑
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="result-body">
      {renderRoster('A')}

      <div className="result-card">
        <div className="result-card-placeholder">Матч отменён</div>
        <div className="result-card-body">
          {restoring ? (
            <div className="edit-result-form">
              <select className="text-input" value={map} onChange={(e) => setMap(e.target.value)}>
                {match.map_pool.map((code) => (
                  <option key={code} value={code}>
                    {mapByCode(code)?.name ?? code}
                  </option>
                ))}
              </select>
              <div className="score-form">
                <input
                  className="text-input score-input"
                  inputMode="numeric"
                  placeholder="A"
                  maxLength={2}
                  value={scoreA}
                  onChange={(e) => setScoreA(clampScore(e.target.value))}
                />
                <span>:</span>
                <input
                  className="text-input score-input"
                  inputMode="numeric"
                  placeholder="B"
                  maxLength={2}
                  value={scoreB}
                  onChange={(e) => setScoreB(clampScore(e.target.value))}
                />
              </div>
              {error && (
                <p className="lobby-hint" style={{ color: 'var(--ban)' }}>
                  {error}
                </p>
              )}
              <div className="edit-result-actions">
                <button className="btn btn-primary btn-sm" onClick={restore} disabled={saving}>
                  Сохранить
                </button>
                <button className="btn btn-sm" onClick={() => setRestoring(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="lobby-hint">Этот матч не состоялся и не учитывается в результатах.</p>
              {canManage && (
                <button className="btn btn-sm" onClick={startRestoring}>
                  Восстановить с результатом
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {renderRoster('B')}
    </div>
  )
}
