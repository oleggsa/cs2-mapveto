import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { steamAuthUrl } from '../lib/supabase'
import { SteamIcon } from '../components/SteamIcon'
import { useMatchesList, type StatusFilter } from '../hooks/useMatchesList'
import { useTournamentsList } from '../hooks/useTournamentsList'
import { TOURNAMENT_STATUS_LABEL } from '../lib/tournamentStatus'
import { MATCH_STATUS_LABEL } from '../lib/matchStatus'
import { mapByCode } from '../config/mapPool'
import { teamSuffix } from '../lib/teamNames'
import type { MatchListItem, Profile, Team } from '../types'

interface Props {
  session: Session | null
  profile: Profile | null
}

type Section = 'matches' | 'tournaments'

interface HomeViewState {
  section: Section
  status: StatusFilter
}

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'active' || value === 'completed' ? value : 'all'
}

// Keeps the active tab and its status filter in the hash's query string
// (e.g. `#/?tab=tournaments&status=completed`) rather than component state
// alone, so a page refresh — or the back/forward buttons — lands back on
// whatever was open, instead of always resetting to "Матчи" / "Все". The
// status filter is scoped to whichever tab is active — switching tabs always
// starts that tab back on "Все" rather than remembering a filter across tabs.
function readHomeViewState(): HomeViewState {
  const query = window.location.hash.replace(/^#/, '').split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  return {
    section: params.get('tab') === 'tournaments' ? 'tournaments' : 'matches',
    status: parseStatusFilter(params.get('status')),
  }
}

function writeHomeViewState(state: HomeViewState) {
  const params = new URLSearchParams()
  if (state.section === 'tournaments') params.set('tab', 'tournaments')
  if (state.status !== 'all') params.set('status', state.status)
  const query = params.toString()
  window.location.hash = query ? `/?${query}` : '/'
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

/** null when the viewer wasn't seated in this match (e.g. they only created a
 * standalone match without joining a slot) or the match has no score yet. */
function matchResult(m: MatchListItem): 'win' | 'loss' | null {
  if (!m.myTeam || m.score_a == null || m.score_b == null) return null
  const my = m.myTeam === 'A' ? m.score_a : m.score_b
  const their = m.myTeam === 'A' ? m.score_b : m.score_a
  if (my === their) return null
  return my > their ? 'win' : 'loss'
}

function statusLabel(m: MatchListItem, result: 'win' | 'loss' | null): string {
  if (m.status === 'done' && result === 'win') return 'Победа'
  if (m.status === 'done' && result === 'loss') return 'Поражение'
  return MATCH_STATUS_LABEL[m.status] ?? m.status
}

export function Home({ session, profile }: Props) {
  const initialView = readHomeViewState()
  const [section, setSectionState] = useState<Section>(initialView.section)
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>(
    initialView.section === 'matches' ? initialView.status : 'all',
  )
  const [tournamentStatusFilter, setTournamentStatusFilterState] = useState<StatusFilter>(
    initialView.section === 'tournaments' ? initialView.status : 'all',
  )

  useEffect(() => {
    const onHashChange = () => {
      const state = readHomeViewState()
      setSectionState(state.section)
      setStatusFilterState(state.section === 'matches' ? state.status : 'all')
      setTournamentStatusFilterState(state.section === 'tournaments' ? state.status : 'all')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function setSection(next: Section) {
    setSectionState(next)
    setStatusFilterState('all')
    setTournamentStatusFilterState('all')
    writeHomeViewState({ section: next, status: 'all' })
  }

  function setStatusFilter(next: StatusFilter) {
    setStatusFilterState(next)
    writeHomeViewState({ section: 'matches', status: next })
  }

  function setTournamentStatusFilter(next: StatusFilter) {
    setTournamentStatusFilterState(next)
    writeHomeViewState({ section: 'tournaments', status: next })
  }

  const { matches, loading } = useMatchesList(statusFilter, 'mine', profile?.id ?? '')
  const { tournaments, loading: tournamentsLoading } = useTournamentsList(tournamentStatusFilter, profile?.id ?? '')

  if (!session || !profile) {
    return (
      <div className="center-page">
        <div className="center-card">
          <h1>CS2 Hub</h1>
          <p>Матчи и турниры по CS2: бан-пик карт в формате Premier, составы команд, турнирная сетка и статистика игроков.</p>
          <a className="btn btn-steam" href={steamAuthUrl('')}>
            <SteamIcon />
            Войти через Steam
          </a>
        </div>
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
            const result = matchResult(m)
            const myScore = m.myTeam === 'A' ? m.score_a : m.score_b
            const theirScore = m.myTeam === 'A' ? m.score_b : m.score_a
            return (
              <a
                key={m.id}
                className={`match-row ${result ? `match-row--${result}` : ''}`}
                href={`#/room/${m.id}`}
              >
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
                    {m.myTeam ? (
                      <>
                        {teamSuffix(m, m.myTeam)} vs {teamSuffix(m, opponent(m.myTeam))}
                      </>
                    ) : (
                      <>
                        {teamSuffix(m, 'A')} vs {teamSuffix(m, 'B')}
                      </>
                    )}
                  </span>
                  {hasScore && (
                    <span className={`match-row-score ${result ? `match-row-result--${result}` : ''}`}>
                      {m.myTeam ? `${myScore}:${theirScore}` : `${m.score_a}:${m.score_b}`}
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
