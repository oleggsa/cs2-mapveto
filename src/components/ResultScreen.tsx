import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { mapByCode } from '../config/mapPool'
import { isPrivileged } from '../lib/permissions'
import { teamLabel } from '../lib/teamNames'
import { PlayerLink } from './PlayerLink'
import type { Match, MatchPlayer, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  me: Profile
  onChanged: () => void
}

function clampScore(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 2)
  if (digits === '') return ''
  return String(Math.min(50, Number(digits)))
}

export function ResultScreen({ match, players, me, onChanged }: Props) {
  const map = match.final_map ? mapByCode(match.final_map) : undefined
  const isHost = isPrivileged(match, me)
  const hasScore = match.score_a != null && match.score_b != null

  const [scoreA, setScoreA] = useState(String(match.score_a ?? ''))
  const [scoreB, setScoreB] = useState(String(match.score_b ?? ''))
  const [saving, setSaving] = useState(false)

  const [editingResult, setEditingResult] = useState(false)
  const [editMap, setEditMap] = useState(match.final_map ?? match.map_pool[0])
  const [editScoreA, setEditScoreA] = useState(String(match.score_a ?? 0))
  const [editScoreB, setEditScoreB] = useState(String(match.score_b ?? 0))
  const [editSaving, setEditSaving] = useState(false)

  async function saveScore() {
    const a = Number(scoreA)
    const b = Number(scoreB)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 50 || b > 50) return
    setSaving(true)
    const { error } = await supabase.rpc('set_score', { p_match_id: match.id, p_score_a: a, p_score_b: b })
    setSaving(false)
    if (error) console.error(error)
    else onChanged()
  }

  function startEditingResult() {
    setEditMap(match.final_map ?? match.map_pool[0])
    setEditScoreA(String(match.score_a ?? 0))
    setEditScoreB(String(match.score_b ?? 0))
    setEditingResult(true)
  }

  async function saveEditedResult() {
    const a = Number(editScoreA)
    const b = Number(editScoreB)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 50 || b > 50) return
    setEditSaving(true)
    const { error } = await supabase.rpc('admin_edit_result', {
      p_match_id: match.id,
      p_final_map: editMap,
      p_score_a: a,
      p_score_b: b,
    })
    setEditSaving(false)
    if (error) console.error(error)
    else {
      setEditingResult(false)
      onChanged()
    }
  }

  function renderRoster(team: Team) {
    const members = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className="roster">
        <h3>{teamLabel(match, team)}</h3>
        {members.map((m) => (
          <div key={m.slot} className="roster-row">
            <PlayerLink playerId={m.player_id}>{m.profile?.name ?? '—'}</PlayerLink>
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
        {map && <img src={map.image} alt={map.name} />}
        <div className="result-card-body">
          {editingResult ? (
            <div className="edit-result-form">
              <select className="text-input" value={editMap} onChange={(e) => setEditMap(e.target.value)}>
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
                  value={editScoreA}
                  onChange={(e) => setEditScoreA(clampScore(e.target.value))}
                />
                <span>:</span>
                <input
                  className="text-input score-input"
                  inputMode="numeric"
                  placeholder="B"
                  maxLength={2}
                  value={editScoreB}
                  onChange={(e) => setEditScoreB(clampScore(e.target.value))}
                />
              </div>
              <div className="edit-result-actions">
                <button className="btn btn-primary btn-sm" onClick={saveEditedResult} disabled={editSaving}>
                  Сохранить
                </button>
                <button className="btn btn-sm" onClick={() => setEditingResult(false)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="result-map-heading">
                {map?.name ?? match.final_map}
                {me.is_admin && (
                  <button className="icon-btn" onClick={startEditingResult} title="Изменить карту и счёт">
                    ✎
                  </button>
                )}
              </h2>

              {hasScore && (
                <p className="result-score">
                  Счёт: {match.score_a} : {match.score_b}
                </p>
              )}

              {!hasScore && isHost && (
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
                  <button className="btn btn-primary" onClick={saveScore} disabled={saving}>
                    Сохранить счёт
                  </button>
                </div>
              )}
              {!hasScore && !isHost && <p className="lobby-hint">Хост пока не указал счёт</p>}
            </>
          )}
        </div>
      </div>

      {renderRoster('B')}
    </div>
  )
}
