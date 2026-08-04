import { teamLabel } from '../lib/teamNames'
import { PlayerLink } from './PlayerLink'
import type { Match, MatchPlayer, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
}

/** Same roster | card | roster layout as ResultScreen, but with a
 * placeholder in place of the map — a cancelled match still shows who was
 * seated, just without a result. */
export function CancelledMatch({ match, players }: Props) {
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
        <div className="result-card-placeholder">Матч отменён</div>
        <div className="result-card-body">
          <p className="lobby-hint">Этот матч не состоялся и не учитывается в результатах.</p>
        </div>
      </div>

      {renderRoster('B')}
    </div>
  )
}
