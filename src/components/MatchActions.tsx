import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivileged } from '../lib/permissions'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import type { Match, Profile } from '../types'

interface Props {
  match: Match
  me: Profile
  onDeleted: () => void
  onChanged: () => void
}

/** Cancel/delete controls for a match room — rendered alongside the admin
 * roster toggle so both sit on the same row, aligned to opposite edges. */
export function MatchActions({ match, me, onDeleted, onChanged }: Props) {
  const canManage = isPrivileged(match, me)
  const isTournamentMatch = !!match.tournament_id
  const hasRealScore = match.score_a != null && match.score_b != null && (match.score_a > 0 || match.score_b > 0)
  const canCancel = isTournamentMatch && match.status !== 'cancelled' && !hasRealScore
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function deleteRoom() {
    const { error } = await supabase.rpc('delete_match', { p_match_id: match.id })
    if (error) {
      console.error(error)
      return
    }
    onDeleted()
  }

  async function cancelMatch() {
    if (!confirm('Отменить этот матч? Статус изменится на «Отменён».')) return
    const { error } = await supabase.rpc('cancel_match', { p_match_id: match.id })
    if (error) console.error(error)
    else onChanged()
  }

  if (!canManage) return null

  return (
    <div className="match-actions">
      {canCancel && (
        <button className="btn btn-sm" onClick={cancelMatch}>
          Отменить матч
        </button>
      )}
      {!isTournamentMatch && (
        <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
          Удалить комнату
        </button>
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Удалить эту комнату?"
          description="Это действие нельзя отменить."
          onConfirm={deleteRoom}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
