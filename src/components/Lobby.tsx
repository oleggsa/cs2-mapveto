import { supabase } from '../lib/supabase'
import type { MatchPlayer, Profile, Team } from '../types'

interface Props {
  matchId: string
  players: MatchPlayer[]
  me: Profile
}

export function Lobby({ matchId, players, me }: Props) {
  const mySlot = players.find((p) => p.player_id === me.id)
  const filled = players.filter((p) => p.player_id).length

  async function join(team: Team, slot: number) {
    const { error } = await supabase.rpc('join_slot', { p_match_id: matchId, p_team: team, p_slot: slot })
    if (error) console.error(error)
  }

  async function leave() {
    const { error } = await supabase.rpc('leave_slot', { p_match_id: matchId })
    if (error) console.error(error)
  }

  function renderTeam(team: Team, label: string) {
    const slots = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className={`team-column team-column--${team.toLowerCase()}`}>
        <h2>{label}</h2>
        {slots.map((slot) => {
          const isMine = slot.player_id === me.id
          return (
            <div key={slot.slot} className={`slot ${isMine ? 'slot--mine' : ''}`}>
              {slot.player_id ? (
                <>
                  {slot.profile?.avatar_url ? (
                    <img className="slot-avatar" src={slot.profile.avatar_url} alt="" />
                  ) : (
                    <span className="slot-avatar" />
                  )}
                  <span className="slot-name">{slot.profile?.name ?? '…'}</span>
                  {isMine && (
                    <button
                      className="btn"
                      style={{ marginLeft: 'auto', padding: '4px 10px' }}
                      onClick={leave}
                    >
                      Выйти
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="slot-plus"
                  disabled={!!mySlot}
                  onClick={() => join(team, slot.slot)}
                  title="Присоединиться"
                >
                  +
                </button>
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
        {renderTeam('A', 'Команда A')}
        {renderTeam('B', 'Команда B')}
      </div>
      <p className="lobby-hint">{filled}/10 — вето начнётся автоматически, когда заполнятся все слоты</p>
    </>
  )
}
