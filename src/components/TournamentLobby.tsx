import { supabase } from '../lib/supabase'
import { isPrivilegedTournament } from '../lib/permissions'
import { bracketColor } from '../lib/bracketColors'
import { FaceitBadge } from './FaceitBadge'
import { PlayerLink } from './PlayerLink'
import type { Profile, Tournament, TournamentPlayer, TournamentTeam } from '../types'

interface Props {
  tournament: Tournament
  teams: TournamentTeam[]
  players: TournamentPlayer[]
  me: Profile
  onChanged: () => void
}

export function TournamentLobby({ tournament, teams, players, me, onChanged }: Props) {
  const filled = players.filter((p) => p.player_id).length
  const isOrganizer = isPrivilegedTournament(tournament, me)

  async function join(teamId: string, slot: number) {
    const { error } = await supabase.rpc('join_tournament_slot', {
      p_tournament_id: tournament.id,
      p_team_id: teamId,
      p_slot: slot,
    })
    if (error) console.error(error)
    else onChanged()
  }

  async function leave() {
    const { error } = await supabase.rpc('leave_tournament_slot', { p_tournament_id: tournament.id })
    if (error) console.error(error)
    else onChanged()
  }

  async function kick(teamId: string, slot: number) {
    const { error } = await supabase.rpc('kick_tournament_player', {
      p_tournament_id: tournament.id,
      p_team_id: teamId,
      p_slot: slot,
    })
    if (error) console.error(error)
    else onChanged()
  }

  async function startTournament() {
    const { error } = await supabase.rpc('start_tournament', { p_tournament_id: tournament.id })
    if (error) console.error(error)
    else onChanged()
  }

  function renderTeam(team: TournamentTeam) {
    const slots = players.filter((p) => p.team_id === team.id).sort((a, b) => a.slot - b.slot)
    const color = bracketColor(team.seed)

    return (
      <div key={team.id} className="team-column" style={{ borderTopColor: color, borderTopWidth: 3 }}>
        <h2 style={{ color }}>{team.name}</h2>

        {slots.map((slot) => {
          const isMine = slot.player_id === me.id
          const isEmpty = !slot.player_id

          return (
            <div
              key={slot.slot}
              className={`slot ${isMine ? 'slot--mine' : ''} ${isEmpty ? 'slot--joinable' : ''}`}
              onClick={isEmpty ? () => join(team.id, slot.slot) : undefined}
            >
              {slot.player_id ? (
                <>
                  <PlayerLink playerId={slot.player_id} className="slot-player-link">
                    <span className="avatar-wrap">
                      {slot.profile?.avatar_url ? (
                        <img className="slot-avatar" src={slot.profile.avatar_url} alt="" />
                      ) : (
                        <span className="slot-avatar" />
                      )}
                      <FaceitBadge level={slot.profile?.faceit_level} elo={slot.profile?.faceit_elo} />
                      {slot.slot === 0 && (
                        <span className="captain-crown" title="Капитан">
                          👑
                        </span>
                      )}
                    </span>
                    <span className="slot-name">{slot.profile?.name ?? '…'}</span>
                  </PlayerLink>
                  {isMine && (
                    <button className="slot-action" onClick={leave}>
                      Выйти
                    </button>
                  )}
                  {!isMine && isOrganizer && (
                    <button
                      className="slot-action slot-action--kick"
                      onClick={(e) => {
                        e.stopPropagation()
                        kick(team.id, slot.slot)
                      }}
                      title="Удалить из лобби"
                    >
                      ✕
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="slot-plus">+</span>
                  {slot.slot === 0 && <span className="slot-name slot-name--muted">Место капитана</span>}
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div className="tournament-lobby">{teams.map(renderTeam)}</div>

      {filled < 20 && (
        <p className="lobby-hint">{filled}/20 — для старта турнира нужно заполнить все составы</p>
      )}
      {(filled === 20 || me.is_admin) && isOrganizer && (
        <div className="lobby-hint">
          <button className="btn btn-primary" onClick={startTournament}>
            {filled === 20 ? 'Начать турнир' : 'Начать турнир (админ, неполные составы)'}
          </button>
        </div>
      )}
      {filled === 20 && !isOrganizer && (
        <p className="lobby-hint">Все составы заполнены — ждём, когда организатор начнёт турнир</p>
      )}
    </>
  )
}
