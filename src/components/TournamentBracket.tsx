import { bracketColor } from '../lib/bracketColors'
import { mapByCode } from '../config/mapPool'
import type { Profile, TournamentMatch, TournamentPlayer, TournamentTeam } from '../types'

interface Props {
  teams: TournamentTeam[]
  matches: TournamentMatch[]
  players: TournamentPlayer[]
  me?: Profile | null
}

interface Standing {
  team: TournamentTeam
  played: number
  wins: number
  losses: number
  roundDiff: number
}

const GAMES_PER_TEAM = 3

function computeStandings(teams: TournamentTeam[], matches: TournamentMatch[]): Standing[] {
  const byId = new Map<string, Standing>(
    teams.map((team) => [team.id, { team, played: 0, wins: 0, losses: 0, roundDiff: 0 }]),
  )

  for (const m of matches) {
    if (m.score_a == null || m.score_b == null) continue
    const a = byId.get(m.tournament_team_a_id)
    const b = byId.get(m.tournament_team_b_id)
    if (!a || !b) continue

    a.played += 1
    b.played += 1
    a.roundDiff += m.score_a - m.score_b
    b.roundDiff += m.score_b - m.score_a
    if (m.score_a > m.score_b) {
      a.wins += 1
      b.losses += 1
    } else if (m.score_b > m.score_a) {
      b.wins += 1
      a.losses += 1
    }
  }

  return [...byId.values()].sort(
    (x, y) => y.wins - x.wins || y.roundDiff - x.roundDiff || x.team.name.localeCompare(y.team.name),
  )
}

function TeamTag({ team, players }: { team: TournamentTeam | undefined; players: TournamentPlayer[] }) {
  if (!team) return <span className="bracket-team">—</span>
  const roster = players.filter((p) => p.team_id === team.id).sort((a, b) => a.slot - b.slot)

  return (
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
  )
}

function isRoundUnlocked(m: TournamentMatch, matches: TournamentMatch[]): boolean {
  if (m.tournament_round_no === 1) return true
  return matches
    .filter((x) => x.tournament_round_no === m.tournament_round_no - 1)
    .every((x) => x.status === 'cancelled' || (x.score_a != null && x.score_b != null))
}

function matchStatusLabel(m: TournamentMatch, matches: TournamentMatch[]): string {
  if (m.status === 'cancelled') return 'Отменён'
  if (m.status === 'veto') return 'Идёт вето'
  if (m.status === 'done' && m.score_a == null) return 'Ждёт результата'
  if (m.status === 'scheduled') {
    if (!isRoundUnlocked(m, matches)) return 'Ждёт окончания предыдущего раунда'
    const readyCount = (m.ready_a ? 1 : 0) + (m.ready_b ? 1 : 0)
    return `Готовность команд: ${readyCount}/2`
  }
  return ''
}

export function TournamentBracket({ teams, matches, players, me }: Props) {
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const rounds = [1, 2, 3].map((roundNo) => ({
    roundNo,
    boards: matches.filter((m) => m.tournament_round_no === roundNo).sort((a, b) => a.tournament_board_no - b.tournament_board_no),
  }))
  const standings = computeStandings(teams, matches)
  const myTeamId = me ? players.find((p) => p.player_id === me.id)?.team_id : undefined

  return (
    <div className="bracket">
      <div className="bracket-rounds">
        {rounds.map(({ roundNo, boards }) => (
          <div key={roundNo} className="bracket-round">
            <h3>Раунд {roundNo}</h3>
            {boards.map((m) => {
              const teamA = teamById.get(m.tournament_team_a_id)
              const teamB = teamById.get(m.tournament_team_b_id)
              const hasScore = m.score_a != null && m.score_b != null
              const aWins = hasScore && m.score_a! > m.score_b!
              const bWins = hasScore && m.score_b! > m.score_a!
              const footer = hasScore
                ? (m.final_map && (mapByCode(m.final_map)?.name ?? m.final_map)) || ''
                : matchStatusLabel(m, matches)

              return (
                <a key={m.id} className="bracket-match" href={`#/room/${m.id}`}>
                  <div className={`bracket-match-row ${aWins ? 'bracket-match-row--winner' : ''}`}>
                    <TeamTag team={teamA} players={players} />
                    <span className="bracket-score">{hasScore ? m.score_a : '–'}</span>
                  </div>
                  <div className={`bracket-match-row ${bWins ? 'bracket-match-row--winner' : ''}`}>
                    <TeamTag team={teamB} players={players} />
                    <span className="bracket-score">{hasScore ? m.score_b : '–'}</span>
                  </div>
                  <span
                    className={`bracket-match-status ${hasScore ? 'bracket-match-status--map' : ''} ${
                      m.status === 'cancelled' ? 'bracket-match-status--cancelled' : ''
                    }`}
                  >
                    {footer}
                  </span>
                </a>
              )
            })}
          </div>
        ))}
      </div>

      <div className="standings-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Место</th>
              <th>Команда</th>
              <th title="Сыграно матчей">И</th>
              <th title="Победы – поражения">В-П</th>
              <th title="Разница выигранных и проигранных раундов">Разница раундов</th>
              <th title="Матчи, которые ещё предстоит сыграть">Осталось</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.team.id} className={s.team.id === myTeamId ? 'standings-row--me' : ''}>
                <td className="standings-place">{i + 1}</td>
                <td>
                  <TeamTag team={s.team} players={players} />
                </td>
                <td>{s.played}</td>
                <td>
                  {s.wins}-{s.losses}
                </td>
                <td
                  className={s.roundDiff > 0 ? 'standings-diff--pos' : s.roundDiff < 0 ? 'standings-diff--neg' : ''}
                >
                  {s.roundDiff > 0 ? `+${s.roundDiff}` : s.roundDiff}
                </td>
                <td>{GAMES_PER_TEAM - s.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
