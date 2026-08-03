import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, steamAuthUrl } from '../lib/supabase'
import { MAP_POOL_CODES } from '../config/mapPool'
import { useMatchesList, type StatusFilter } from '../hooks/useMatchesList'
import type { Profile } from '../types'

interface Props {
  session: Session | null
  profile: Profile | null
  onCreated: (roomId: string) => void
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

export function Home({ session, profile, onCreated }: Props) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  // TODO: re-enable an "Все/Мои" scope toggle once there's enough real match
  // volume for it to matter — hidden for now per request.
  const { matches, loading } = useMatchesList(statusFilter, 'all', profile?.id ?? '')

  async function createMatch() {
    setCreating(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_match', { p_map_pool: MAP_POOL_CODES })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated(data as string)
  }

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
      <div className="center-card" style={{ margin: '0 auto 32px' }}>
        <h1>CS2 Map Vote</h1>
        <p>Бан/пик карт в формате Premier: 2 бана, 3 бана, пик карты, пик стороны.</p>
        <button className="btn btn-primary" onClick={createMatch} disabled={creating}>
          {creating ? 'Создаём…' : 'Создать матч'}
        </button>
        {error && <p style={{ color: 'var(--ban)' }}>{error}</p>}
      </div>

      <div className="matches-list">
        <div className="matches-tabs">
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

        {matches.map((m) => (
          <a key={m.id} className="match-row" href={`#/room/${m.id}`}>
            <span className="match-row-name">{m.name || `Матч #${m.id.slice(0, 8)}`}</span>
            <span className="match-row-meta">{m.creator?.name ?? '—'}</span>
            <span className="match-row-meta">{formatDate(m.created_at)}</span>
            <span className="match-row-meta">{m.filled}/10</span>
            <span className="match-row-status">{STATUS_LABEL[m.status] ?? m.status}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
