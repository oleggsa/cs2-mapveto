import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { teamLabel } from '../lib/teamNames'
import type { Match, MatchPlayer, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  onChanged: () => void
}

interface ActiveSlot {
  team: Team
  slot: number
}

/** Super-admin-only panel: fix this one match's roster directly, at any
 * stage — e.g. crediting a stand-in for this specific game only. */
export function MatchAdminRoster({ match, players, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  async function clear(team: Team, slot: number) {
    const { error } = await supabase.rpc('kick_player', { p_match_id: match.id, p_team: team, p_slot: slot })
    if (error) console.error(error)
    else onChanged()
  }

  async function assign(profileId: string) {
    if (!activeSlot) return
    setAssignError(null)
    const { error } = await supabase.rpc('admin_set_match_player', {
      p_match_id: match.id,
      p_team: activeSlot.team,
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

  function openSearch(team: Team, slot: number) {
    setActiveSlot({ team, slot })
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

  if (!open) {
    return (
      <button className="btn btn-sm admin-roster-toggle" onClick={() => setOpen(true)}>
        Управление составом (админ)
      </button>
    )
  }

  function renderTeam(team: Team) {
    const slots = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className="admin-roster-team">
        <h4>{teamLabel(match, team)}</h4>
        {slots.map((slot) => (
          <div key={slot.slot} className="admin-roster-slot">
            <span className="admin-roster-slot-name">{slot.player_id ? slot.profile?.name ?? '…' : '—'}</span>
            <div className="admin-roster-slot-actions">
              {slot.player_id && (
                <button className="btn btn-sm" onClick={() => clear(team, slot.slot)}>
                  Очистить
                </button>
              )}
              <button className="btn btn-sm" onClick={() => openSearch(team, slot.slot)}>
                Назначить
              </button>
            </div>

            {activeSlot?.team === team && activeSlot.slot === slot.slot && (
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
  }

  return (
    <div className="admin-roster-panel">
      <div className="admin-roster-panel-header">
        <h3>Управление составом (админ)</h3>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>
          Свернуть
        </button>
      </div>

      <div className="admin-roster-teams admin-roster-teams--match">
        {renderTeam('A')}
        {renderTeam('B')}
      </div>
    </div>
  )
}
