import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivileged } from '../lib/permissions'
import { CopyLink } from './CopyLink'
import type { Match, Profile } from '../types'

interface Props {
  match: Match
  me: Profile
  roomId: string
  onDeleted: () => void
  onChanged: () => void
}

export function RoomHeader({ match, me, roomId, onDeleted, onChanged }: Props) {
  const canManage = isPrivileged(match, me)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(match.name ?? '')

  async function saveName() {
    const { error } = await supabase.rpc('rename_match', { p_match_id: match.id, p_name: name })
    if (error) console.error(error)
    else onChanged()
    setEditing(false)
  }

  async function deleteRoom() {
    if (!confirm('Удалить эту комнату? Это действие нельзя отменить.')) return
    const { error } = await supabase.rpc('delete_match', { p_match_id: match.id })
    if (error) {
      console.error(error)
      return
    }
    onDeleted()
  }

  return (
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
          </>
        )}
      </div>

      <div className="room-header-actions">
        <CopyLink text={window.location.href} />
        {canManage && (
          <button className="btn btn-danger" onClick={deleteRoom}>
            Удалить комнату
          </button>
        )}
      </div>
    </div>
  )
}
