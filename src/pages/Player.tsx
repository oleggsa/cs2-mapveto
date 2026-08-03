import { usePlayerProfile } from '../hooks/usePlayerProfile'
import { FaceitBadge } from '../components/FaceitBadge'
import { mapByCode } from '../config/mapPool'
import { teamSuffix } from '../lib/teamNames'
import type { PlayerMatchItem, Team } from '../types'

interface Props {
  playerId: string
}

const STATUS_LABEL: Record<string, string> = {
  lobby: 'Сбор игроков',
  veto: 'Идёт вето',
  done: 'Завершён',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function opponent(team: Team): Team {
  return team === 'A' ? 'B' : 'A'
}

function matchResult(m: PlayerMatchItem): 'win' | 'loss' | null {
  if (m.score_a == null || m.score_b == null) return null
  const my = m.myTeam === 'A' ? m.score_a : m.score_b
  const their = m.myTeam === 'A' ? m.score_b : m.score_a
  if (my === their) return null
  return my > their ? 'win' : 'loss'
}

export function Player({ playerId }: Props) {
  const { profile, matches, loading } = usePlayerProfile(playerId)

  if (loading) {
    return (
      <div className="page">
        <p className="lobby-hint">Загрузка…</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="center-card">
        <h1>Игрок не найден</h1>
      </div>
    )
  }

  const results = matches.map(matchResult)
  const wins = results.filter((r) => r === 'win').length
  const losses = results.filter((r) => r === 'loss').length

  return (
    <div className="page">
      <div className="center-card player-header" style={{ margin: '0 auto 32px' }}>
        <span className="avatar-wrap player-avatar-wrap">
          {profile.avatar_url ? (
            <img className="player-avatar" src={profile.avatar_url} alt="" />
          ) : (
            <span className="player-avatar" />
          )}
          <FaceitBadge level={profile.faceit_level} elo={profile.faceit_elo} />
        </span>
        <h1>{profile.name}</h1>
        <p>
          {matches.length} матчей
          {wins + losses > 0 ? ` · ${wins}W ${losses}L` : ''}
        </p>
      </div>

      <div className="matches-list">
        {matches.length === 0 && <p className="lobby-hint">Пока нет сыгранных матчей</p>}

        {matches.map((m) => {
          const myScore = m.myTeam === 'A' ? m.score_a : m.score_b
          const theirScore = m.myTeam === 'A' ? m.score_b : m.score_a
          const hasScore = myScore != null && theirScore != null
          const result = matchResult(m)
          return (
            <a key={m.id} className="match-row match-row--player" href={`#/room/${m.id}`}>
              <span className="match-row-name">{m.name || `Матч #${m.id.slice(0, 8)}`}</span>
              <span className="match-row-meta">{m.final_map ? (mapByCode(m.final_map)?.name ?? m.final_map) : '—'}</span>
              <span className="match-row-meta">
                {teamSuffix(m, m.myTeam)} vs {teamSuffix(m, opponent(m.myTeam))}
              </span>
              <span className={`match-row-meta ${result ? `match-row-result--${result}` : ''}`}>
                {hasScore ? `${myScore}:${theirScore}` : '—'}
              </span>
              <span className="match-row-meta">{formatDate(m.created_at)}</span>
              <span className="match-row-status">{STATUS_LABEL[m.status] ?? m.status}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
