import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MAP_POOL_CODES } from '../config/mapPool'

interface Props {
  onCreated: (tournamentId: string) => void
  onCancel: () => void
}

export function CreateTournamentModal({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('')
  const [teamNames, setTeamNames] = useState(['', '', '', ''])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateTeamName(i: number, value: string) {
    setTeamNames((prev) => prev.map((v, idx) => (idx === i ? value : v)))
  }

  async function submit() {
    setCreating(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_tournament', {
      p_name: name,
      p_team_names: teamNames.map((n, i) => n.trim() || `Команда ${i + 1}`),
      p_map_pool: MAP_POOL_CODES,
    })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated(data as string)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Создать турнир</h2>
        <p className="modal-description">
          Раунд-робин на 4 команды: каждая играет с каждой.
        </p>
        <input
          className="text-input"
          placeholder="Название турнира"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
        />
        {teamNames.map((teamName, i) => (
          <input
            key={i}
            className="text-input"
            placeholder={`Команда ${i + 1}`}
            value={teamName}
            onChange={(e) => updateTeamName(i, e.target.value)}
            maxLength={40}
          />
        ))}
        {error && <p style={{ color: 'var(--ban)' }}>{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-sm btn-primary" onClick={submit} disabled={creating}>
            {creating ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
