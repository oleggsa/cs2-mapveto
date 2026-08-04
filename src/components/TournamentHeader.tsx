import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivilegedTournament } from '../lib/permissions'
import { bracketColor } from '../lib/bracketColors'
import { TOURNAMENT_STATUS_LABEL } from '../lib/tournamentStatus'
import type { TournamentWithOrganizer } from '../hooks/useTournament'
import { CopyLink } from './CopyLink'
import { PlayerLink } from './PlayerLink'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import type { Profile, TournamentPlayer, TournamentTeam } from '../types'

interface Props {
  tournament: TournamentWithOrganizer
  teams: TournamentTeam[]
  players: TournamentPlayer[]
  me: Profile
  tournamentId: string
  onDeleted: () => void
  onChanged: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TournamentHeader({ tournament, teams, players, me, tournamentId, onDeleted, onChanged }: Props) {
  const canManage = isPrivilegedTournament(tournament, me)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tournament.name ?? '')
  const [teamNameInputs, setTeamNameInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  function startEditing() {
    setName(tournament.name ?? '')
    setTeamNameInputs(Object.fromEntries(teams.map((t) => [t.id, t.name])))
    setEditing(true)
  }

  async function saveAll() {
    setSaving(true)
    const changedTeams = teams.filter((t) => teamNameInputs[t.id] !== undefined && teamNameInputs[t.id] !== t.name)
    const { error } = await Promise.all([
      supabase.rpc('rename_tournament', { p_tournament_id: tournament.id, p_name: name }),
      ...changedTeams.map((t) =>
        supabase.rpc('rename_tournament_team', {
          p_tournament_id: tournament.id,
          p_team_id: t.id,
          p_name: teamNameInputs[t.id],
        }),
      ),
    ]).then((results) => results.find((r) => r.error) ?? { error: null })
    setSaving(false)
    if (error) console.error(error)
    onChanged()
    setEditing(false)
  }

  async function deleteTournament() {
    const { error } = await supabase.rpc('delete_tournament', { p_tournament_id: tournament.id })
    if (error) {
      console.error(error)
      return
    }
    onDeleted()
  }

  const isHistorical = tournament.status === 'done' || tournament.status === 'cancelled'

  return (
    <div className="tournament-header">
      <div className="room-header">
        <div className="room-title">
          {editing ? (
            <input
              className="text-input room-title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          ) : (
            <h1>{tournament.name || `Турнир #${tournamentId.slice(0, 8)}`}</h1>
          )}
          {canManage && !editing && (
            <button className="icon-btn" onClick={startEditing} title="Редактировать турнир и команды">
              ✎
            </button>
          )}
          {editing && (
            <>
              <button className="btn btn-sm" onClick={saveAll} disabled={saving}>
                Сохранить
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </>
          )}
        </div>

        <div className="room-header-actions">
          <CopyLink text={window.location.href} compact={isHistorical} />
          {canManage && (
            <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
              Удалить турнир
            </button>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Удалить турнир?"
          description="Все его матчи тоже будут удалены. Это действие нельзя отменить."
          onConfirm={deleteTournament}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <div className="tournament-meta">
        <span className="tournament-meta-item">
          <span className="tournament-meta-label">Формат</span>Round Robin
        </span>
        <span className="tournament-meta-item">
          <span className="tournament-meta-label">Игра</span>
          {tournament.game}
        </span>
        <span className="tournament-meta-item">
          <span className="tournament-meta-label">Создан</span>
          {formatDate(tournament.created_at)}
        </span>
        <span className="tournament-meta-item">
          <span className="tournament-meta-label">Организатор</span>
          <PlayerLink playerId={tournament.created_by}>{tournament.creator?.name ?? '—'}</PlayerLink>
        </span>
        <span className={`status-badge ${tournament.status === 'cancelled' ? 'status-badge--cancelled' : ''}`}>
          {TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status}
        </span>
      </div>

      <div className="tournament-teams-strip">
        {teams.map((team) => {
          const roster = players.filter((p) => p.team_id === team.id).sort((a, b) => a.slot - b.slot)
          return (
            <span key={team.id} className="tournament-teams-strip-item">
              {editing ? (
                <>
                  <span className="bracket-dot" style={{ background: bracketColor(team.seed) }} />
                  <input
                    className="text-input team-name-input"
                    value={teamNameInputs[team.id] ?? team.name}
                    onChange={(e) => setTeamNameInputs((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    maxLength={40}
                  />
                </>
              ) : (
                <span className="team-hover">
                  <span className="bracket-team">
                    <span className="bracket-dot" style={{ background: bracketColor(team.seed) }} />
                    {team.name}
                  </span>
                  <span className="team-roster-tooltip">
                    {roster.map((p) => (
                      <span key={p.slot} className="team-roster-tooltip-row">
                        {p.player_id ? (p.profile?.name ?? '…') : '—'}
                        {p.slot === 0 && p.player_id && (
                          <span className="captain-tag" title="Капитан">
                            👑
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
