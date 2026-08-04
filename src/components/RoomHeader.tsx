import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivileged } from '../lib/permissions'
import { MATCH_STATUS_LABEL } from '../lib/matchStatus'
import { teamSuffix } from '../lib/teamNames'
import { CopyLink } from './CopyLink'
import type { Match, MatchPlayer, Profile } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  me: Profile | null
  roomId: string
  onChanged: () => void
}

export function RoomHeader({ match, players, me, roomId, onChanged }: Props) {
  const canManage = isPrivileged(match, me)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(match.name ?? '')
  const isHistorical = match.status === 'done' || match.status === 'cancelled'
  const myTeam = players.find((p) => p.player_id === me?.id)?.team ?? null

  async function saveName() {
    const { error } = await supabase.rpc('rename_match', { p_match_id: match.id, p_name: name })
    if (error) console.error(error)
    else onChanged()
    setEditing(false)
  }

  return (
    <div>
      {match.tournament_id && (
        <a className="tournament-back-link" href={`#/tournament/${match.tournament_id}`}>
          ← К турнирной сетке
        </a>
      )}

      <div className="room-header">
        <div className="room-title">
          {editing ? (
            <>
              <input
                className="text-input room-title-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
              <button className="btn btn-sm" onClick={saveName}>
                Сохранить
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </>
          ) : (
            <>
              <h1>{match.name || `Матч #${roomId.slice(0, 8)}`}</h1>
              {canManage && (
                <button className="icon-btn" onClick={() => setEditing(true)} title="Переименовать">
                  ✎
                </button>
              )}
              {myTeam && (
                <span className={`my-team-tag my-team-tag--${myTeam.toLowerCase()}`}>
                  Вы играете за {teamSuffix(match, myTeam)}
                </span>
              )}
            </>
          )}
        </div>

        <div className="room-header-actions">
          {isHistorical ? (
            <>
              <CopyLink text={window.location.href} compact />
              <span className={`status-badge ${match.status === 'cancelled' ? 'status-badge--cancelled' : ''}`}>
                {MATCH_STATUS_LABEL[match.status] ?? match.status}
              </span>
            </>
          ) : (
            <>
              <span className="status-badge">{MATCH_STATUS_LABEL[match.status] ?? match.status}</span>
              <CopyLink text={window.location.href} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
