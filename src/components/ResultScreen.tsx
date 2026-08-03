import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { mapByCode } from '../config/mapPool'
import { isPrivileged } from '../lib/permissions'
import type { Match, Profile } from '../types'

interface Props {
  match: Match
  me: Profile
  onChanged: () => void
}

export function ResultScreen({ match, me, onChanged }: Props) {
  const map = match.final_map ? mapByCode(match.final_map) : undefined
  const isHost = isPrivileged(match, me)
  const hasScore = match.score_a != null && match.score_b != null

  const [scoreA, setScoreA] = useState(String(match.score_a ?? ''))
  const [scoreB, setScoreB] = useState(String(match.score_b ?? ''))
  const [saving, setSaving] = useState(false)

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

  return (
    <div className="result-card">
      {map && <img src={map.image} alt={map.name} />}
      <div className="result-card-body">
        <h2>{map?.name ?? match.final_map}</h2>

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
              onChange={(e) => setScoreA(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <span>:</span>
            <input
              className="text-input score-input"
              inputMode="numeric"
              placeholder="B"
              maxLength={2}
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <button className="btn btn-primary" onClick={saveScore} disabled={saving}>
              Сохранить счёт
            </button>
          </div>
        )}
        {!hasScore && !isHost && <p className="lobby-hint">Хост пока не указал счёт</p>}
      </div>
    </div>
  )
}
