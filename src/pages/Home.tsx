import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { steamAuthUrl } from '../lib/supabase'
import { useMatchesList, type StatusFilter } from '../hooks/useMatchesList'
import { useTournamentsList } from '../hooks/useTournamentsList'
import { TOURNAMENT_STATUS_LABEL } from '../lib/tournamentStatus'
import { MATCH_STATUS_LABEL } from '../lib/matchStatus'
import { mapByCode } from '../config/mapPool'
import { teamSuffix } from '../lib/teamNames'
import type { Profile } from '../types'

interface Props {
  session: Session | null
  profile: Profile | null
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

export function Home({ session, profile }: Props) {
  const [section, setSection] = useState<Section>('matches')

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const { matches, loading } = useMatchesList(statusFilter, 'mine', profile?.id ?? '')

  const [tournamentStatusFilter, setTournamentStatusFilter] = useState<StatusFilter>('all')
  const { tournaments, loading: tournamentsLoading } = useTournamentsList(tournamentStatusFilter, profile?.id ?? '')

  if (!session || !profile) {
    return (
      <div className="center-card">
        <h1>CS2 Map Vote</h1>
        <p>Бан/пик карт в формате Premier: 2 бана, 3 бана, пик карты, пик стороны.</p>
        <a className="btn btn-steam" href={steamAuthUrl('')}>
          Войти через Steam
        </a>
      </div>
    )
  }

  return (
    <div className="page">
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
          <div className="matches-tabs">
            <button
              className={`tab ${statusFilter === 'all' ? 'tab--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Все
            </button>
            <button
              className={`tab ${statusFilter === 'active' ? 'tab--active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Активные
            </button>
            <button
              className={`tab ${statusFilter === 'completed' ? 'tab--active' : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Завершённые
            </button>
          </div>

          {loading && <p className="lobby-hint">Загрузка…</p>}
          {!loading && matches.length === 0 && <p className="lobby-hint">Пока пусто</p>}

          {matches.map((m) => {
            const hasScore = m.score_a != null && m.score_b != null
            return (
              <a key={m.id} className="match-row match-row--player" href={`#/room/${m.id}`}>
                <span className="match-row-name">{m.name || `Матч #${m.id.slice(0, 8)}`}</span>
                <span className="match-row-meta">
                  {m.final_map ? (mapByCode(m.final_map)?.name ?? m.final_map) : '—'}
                </span>
                <span className="match-row-meta">
                  {teamSuffix(m, 'A')} vs {teamSuffix(m, 'B')}
                </span>
                <span className="match-row-meta">{hasScore ? `${m.score_a}:${m.score_b}` : '—'}</span>
                <span className="match-row-meta">{formatDate(m.created_at)}</span>
                <span className="match-row-status">{MATCH_STATUS_LABEL[m.status] ?? m.status}</span>
              </a>
            )
          })}
        </div>
      )}

      {section === 'tournaments' && (
        <div className="matches-list">
          <div className="matches-tabs">
            <button
              className={`tab ${tournamentStatusFilter === 'all' ? 'tab--active' : ''}`}
              onClick={() => setTournamentStatusFilter('all')}
            >
              Все
            </button>
            <button
              className={`tab ${tournamentStatusFilter === 'active' ? 'tab--active' : ''}`}
              onClick={() => setTournamentStatusFilter('active')}
            >
              Активные
            </button>
            <button
              className={`tab ${tournamentStatusFilter === 'completed' ? 'tab--active' : ''}`}
              onClick={() => setTournamentStatusFilter('completed')}
            >
              Завершённые
            </button>
          </div>

          {tournamentsLoading && <p className="lobby-hint">Загрузка…</p>}
          {!tournamentsLoading && tournaments.length === 0 && <p className="lobby-hint">Пока пусто</p>}

          {tournaments.map((t) => (
            <a key={t.id} className="match-row" href={`#/tournament/${t.id}`}>
              <span className="match-row-name">{t.name || `Турнир #${t.id.slice(0, 8)}`}</span>
              <span className="match-row-meta">{t.creator?.name ?? '—'}</span>
              <span className="match-row-meta">{formatDate(t.created_at)}</span>
              <span className="match-row-meta">4 команды</span>
              <span className="match-row-status">{TOURNAMENT_STATUS_LABEL[t.status] ?? t.status}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
