import { useState } from 'react'
import { usePlayerProfile } from '../hooks/usePlayerProfile'
import { FaceitBadge } from '../components/FaceitBadge'
import { mapByCode } from '../config/mapPool'
import { teamSuffix } from '../lib/teamNames'
import { TOURNAMENT_STATUS_LABEL } from '../lib/tournamentStatus'
import { MATCH_STATUS_LABEL } from '../lib/matchStatus'
import { pluralizeRu } from '../lib/pluralize'
import type { PlayerMatchItem, Team } from '../types'

interface Props {
  playerId: string
}

type Section = 'matches' | 'tournaments'

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

function statusLabel(m: PlayerMatchItem, result: 'win' | 'loss' | null): string {
  if (m.status === 'done' && result === 'win') return 'Победа'
  if (m.status === 'done' && result === 'loss') return 'Поражение'
  return MATCH_STATUS_LABEL[m.status] ?? m.status
}

export function Player({ playerId }: Props) {
  const { profile, matches, tournaments, loading } = usePlayerProfile(playerId)
  const [section, setSection] = useState<Section>('matches')

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
      <div className="center-card player-header player-header-card">
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
          {tournaments.length} {pluralizeRu(tournaments.length, 'турнир', 'турнира', 'турниров')} ·{' '}
          {matches.length} {pluralizeRu(matches.length, 'матч', 'матча', 'матчей')}
          {wins + losses > 0 && (
            <>
              {' · '}
              <span className="match-row-result--win">{wins}W</span>{' '}
              <span className="match-row-result--loss">{losses}L</span>
            </>
          )}
        </p>
      </div>

      <div className="section-tabs">
        <button
          className={`section-tab ${section === 'matches' ? 'section-tab--active' : ''}`}
          onClick={() => setSection('matches')}
        >
          Матчи
        </button>
        <button
          className={`section-tab ${section === 'tournaments' ? 'section-tab--active' : ''}`}
          onClick={() => setSection('tournaments')}
        >
          Турниры
        </button>
      </div>

      {section === 'matches' && (
        <div className="matches-list">
          {matches.length === 0 && <p className="lobby-hint">Пока нет сыгранных матчей</p>}

          {matches.map((m) => {
            const myScore = m.myTeam === 'A' ? m.score_a : m.score_b
            const theirScore = m.myTeam === 'A' ? m.score_b : m.score_a
            const hasScore = myScore != null && theirScore != null
            const result = matchResult(m)
            return (
              <a key={m.id} className={`match-row ${result ? `match-row--${result}` : ''}`} href={`#/room/${m.id}`}>
                <div className="match-row-top">
                  <span className="match-row-name">{m.name || `Матч #${m.id.slice(0, 8)}`}</span>
                  <span className={`match-row-status ${result && m.status === 'done' ? `match-row-status--${result}` : ''}`}>
                    {statusLabel(m, result)}
                  </span>
                </div>
                <div className="match-row-bottom">
                  <span className="match-row-meta">
                    {m.final_map ? (mapByCode(m.final_map)?.name ?? m.final_map) : '—'}
                  </span>
                  <span className="match-row-meta">
                    {teamSuffix(m, m.myTeam)} vs {teamSuffix(m, opponent(m.myTeam))}
                  </span>
                  {hasScore && (
                    <span className={`match-row-score ${result ? `match-row-result--${result}` : ''}`}>
                      {myScore}:{theirScore}
                    </span>
                  )}
                  <span className="match-row-meta match-row-date">{formatDate(m.created_at)}</span>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {section === 'tournaments' && (
        <div className="matches-list">
          {tournaments.length === 0 && <p className="lobby-hint">Пока нет турниров</p>}

          {tournaments.map((t) => (
            <a key={t.id} className="match-row" href={`#/tournament/${t.id}`}>
              <div className="match-row-top">
                <span className="match-row-name">{t.name || `Турнир #${t.id.slice(0, 8)}`}</span>
                <span className="match-row-status">{TOURNAMENT_STATUS_LABEL[t.status] ?? t.status}</span>
              </div>
              <div className="match-row-bottom">
                <span className="match-row-meta">{t.creator?.name ?? '—'}</span>
                <span className="match-row-meta">4 команды</span>
                <span className="match-row-meta match-row-date">{formatDate(t.created_at)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
