import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, steamAuthUrl } from '../lib/supabase'
import { MAP_POOL_CODES } from '../config/mapPool'

interface Props {
  session: Session | null
  onCreated: (roomId: string) => void
}

export function Home({ session, onCreated }: Props) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="center-card">
      <h1>CS2 Map Vote</h1>
      <p>Бан/пик карт в формате Premier: 2 бана, 3 бана, пик карты, пик стороны.</p>

      {!session ? (
        <a className="btn btn-steam" href={steamAuthUrl('')}>
          Войти через Steam
        </a>
      ) : (
        <button className="btn btn-primary" onClick={createMatch} disabled={creating}>
          {creating ? 'Создаём…' : 'Создать матч'}
        </button>
      )}

      {error && <p style={{ color: 'var(--ban)' }}>{error}</p>}
    </div>
  )
}
