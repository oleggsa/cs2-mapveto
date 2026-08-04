import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { bracketColor } from '../lib/bracketColors'
import type { Profile, TournamentPlayer, TournamentTeam } from '../types'

interface Props {
  tournamentId: string
  teams: TournamentTeam[]
  players: TournamentPlayer[]
  onChanged: () => void
  onClose: () => void
}

interface ActiveSlot {
  teamId: string
  slot: number
}

/** Super-admin-only panel: clear or directly assign any tournament roster
 * slot, at any tournament stage — not just while still in the lobby. Open
 * state lives in the parent so its toggle button can sit in the header's
 * teams-strip row instead of stacking above this panel. */
export function TournamentAdminRoster({ tournamentId, teams, players, onChanged, onClose }: Props) {
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  async function clear(teamId: string, slot: number) {
    const { error } = await supabase.rpc('kick_tournament_player', {
      p_tournament_id: tournamentId,
      p_team_id: teamId,
      p_slot: slot,
    })
    if (error) console.error(error)
    else onChanged()
  }

  async function assign(profileId: string) {
    if (!activeSlot) return
    setAssignError(null)
    const { error } = await supabase.rpc('admin_set_tournament_player', {
      p_tournament_id: tournamentId,
      p_team_id: activeSlot.teamId,
      p_slot: activeSlot.slot,
      p_player_id: profileId,
    })
    if (error) {
      console.error(error)
      setAssignError(error.message)
      return
    }
    onChanged()
    closeSearch()
  }

  function openSearch(teamId: string, slot: number) {
    setActiveSlot({ teamId, slot })
    setQuery('')
    setResults([])
    setAssignError(null)
  }

  function closeSearch() {
    setActiveSlot(null)
    setQuery('')
    setResults([])
    setAssignError(null)
  }

  async function onQueryChange(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const { data } = await supabase.from('profiles').select('*').ilike('name', `%${value.trim()}%`).limit(8)
    setSearching(false)
    setResults((data as Profile[]) ?? [])
  }

  return (
    <div className="admin-roster-panel">
      <div className="admin-roster-panel-header">
        <h3>Управление составами (админ)</h3>
        <button className="btn btn-sm" onClick={onClose}>
          Свернуть
        </button>
      </div>

      <div className="admin-roster-teams">
        {teams.map((team) => {
          const slots = players.filter((p) => p.team_id === team.id).sort((a, b) => a.slot - b.slot)
          return (
            <div key={team.id} className="admin-roster-team">
              <h4 style={{ color: bracketColor(team.seed) }}>{team.name}</h4>
              {slots.map((slot) => (
                <div key={slot.slot} className="admin-roster-slot">
                  <span className="admin-roster-slot-name">
                    {slot.player_id ? slot.profile?.name ?? '…' : '—'}
                    {slot.slot === 0 && ' (капитан)'}
                  </span>
                  <div className="admin-roster-slot-actions">
                    {slot.player_id && (
                      <button className="btn btn-sm" onClick={() => clear(team.id, slot.slot)}>
                        Очистить
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => openSearch(team.id, slot.slot)}>
                      Назначить
                    </button>
                  </div>

                  {activeSlot?.teamId === team.id && activeSlot.slot === slot.slot && (
                    <div className="admin-roster-search">
                      <input
                        className="text-input"
                        placeholder="Имя игрока…"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        autoFocus
                      />
                      {searching && <p className="lobby-hint">Поиск…</p>}
                      {!searching && query.trim().length >= 2 && results.length === 0 && (
                        <p className="lobby-hint">Никого не найдено</p>
                      )}
                      {results.map((r) => (
                        <button key={r.id} className="admin-roster-search-result" onClick={() => assign(r.id)}>
                          {r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span className="slot-avatar" />}
                          {r.name}
                        </button>
                      ))}
                      {assignError && (
                        <p className="lobby-hint" style={{ color: 'var(--ban)' }}>
                          {assignError}
                        </p>
                      )}
                      <button className="btn btn-sm" onClick={closeSearch}>
                        Отмена
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
