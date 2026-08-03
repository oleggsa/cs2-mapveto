import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPrivileged } from '../lib/permissions'
import { teamSuffix } from '../lib/teamNames'
import { FaceitBadge } from './FaceitBadge'
import type { Match, MatchPlayer, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  me: Profile
  onChanged: () => void
}

export function Lobby({ match, players, me, onChanged }: Props) {
  const filled = players.filter((p) => p.player_id).length
  const isHost = isPrivileged(match, me)

  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamNameInput, setTeamNameInput] = useState('')

  async function join(team: Team, slot: number) {
    const { error } = await supabase.rpc('join_slot', { p_match_id: match.id, p_team: team, p_slot: slot })
    if (error) console.error(error)
    else onChanged()
  }

  async function leave() {
    const { error } = await supabase.rpc('leave_slot', { p_match_id: match.id })
    if (error) console.error(error)
    else onChanged()
  }

  async function kick(team: Team, slot: number) {
    const { error } = await supabase.rpc('kick_player', { p_match_id: match.id, p_team: team, p_slot: slot })
    if (error) console.error(error)
    else onChanged()
  }

  async function startVeto() {
    const { error } = await supabase.rpc('start_veto', { p_match_id: match.id })
    if (error) console.error(error)
    else onChanged()
  }

  function startEditingTeam(team: Team) {
    setTeamNameInput(teamSuffix(match, team))
    setEditingTeam(team)
  }

  async function saveTeamName(team: Team) {
    const { error } = await supabase.rpc('rename_team', {
      p_match_id: match.id,
      p_team: team,
      p_name: teamNameInput,
    })
    if (error) console.error(error)
    else onChanged()
    setEditingTeam(null)
  }

  function renderTeam(team: Team) {
    const slots = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className={`team-column team-column--${team.toLowerCase()}`}>
        {editingTeam === team ? (
          <div className="team-name-edit">
            <input
              className="text-input team-name-input"
              value={teamNameInput}
              onChange={(e) => setTeamNameInput(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <button className="btn btn-sm" onClick={() => saveTeamName(team)}>
              Сохранить
            </button>
            <button className="btn btn-sm" onClick={() => setEditingTeam(null)}>
              Отмена
            </button>
          </div>
        ) : (
          <h2>
            Команда {teamSuffix(match, team)}
            {isHost && (
              <button className="icon-btn" onClick={() => startEditingTeam(team)} title="Переименовать команду">
                ✎
              </button>
            )}
          </h2>
        )}

        {slots.map((slot) => {
          const isMine = slot.player_id === me.id
          const isEmpty = !slot.player_id

          return (
            <div
              key={slot.slot}
              className={`slot ${isMine ? 'slot--mine' : ''} ${isEmpty ? 'slot--joinable' : ''}`}
              onClick={isEmpty ? () => join(team, slot.slot) : undefined}
            >
              {slot.player_id ? (
                <>
                  <span className="avatar-wrap">
                    {slot.profile?.avatar_url ? (
                      <img className="slot-avatar" src={slot.profile.avatar_url} alt="" />
                    ) : (
                      <span className="slot-avatar" />
                    )}
                    <FaceitBadge level={slot.profile?.faceit_level} elo={slot.profile?.faceit_elo} />
                  </span>
                  <span className="slot-name">{slot.profile?.name ?? '…'}</span>
                  {isMine && (
                    <button className="slot-action" onClick={leave}>
                      Выйти
                    </button>
                  )}
                  {!isMine && isHost && (
                    <button
                      className="slot-action slot-action--kick"
                      onClick={(e) => {
                        e.stopPropagation()
                        kick(team, slot.slot)
                      }}
                      title="Удалить из лобби"
                    >
                      ✕
                    </button>
                  )}
                </>
              ) : (
                <span className="slot-plus">+</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div className="lobby">
        {renderTeam('A')}
        {renderTeam('B')}
      </div>

      {filled < 10 && (
        <p className="lobby-hint">{filled}/10 — для старта вето нужно заполнить все слоты</p>
      )}
      {(filled === 10 || me.is_admin) && isHost && (
        <div className="lobby-hint">
          <button className="btn btn-primary" onClick={startVeto}>
            {filled === 10 ? 'Начать голосование' : 'Начать голосование (админ, неполный состав)'}
          </button>
        </div>
      )}
      {filled === 10 && !isHost && (
        <p className="lobby-hint">Все слоты заполнены — ждём, когда хост начнёт голосование</p>
      )}
    </>
  )
}
