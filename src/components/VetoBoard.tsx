import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mapByCode } from '../config/mapPool'
import { teamLabel, teamSuffix } from '../lib/teamNames'
import { PlayerLink } from './PlayerLink'
import type { Match, MatchPlayer, MatchRound, MatchVote, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  rounds: MatchRound[]
  votes: MatchVote[]
  me: Profile | null
  onChanged: () => void
}

function stages(match: Match) {
  return [
    { label: `Бан ${teamSuffix(match, 'A')} ×2`, no: 1 },
    { label: `Бан ${teamSuffix(match, 'B')} ×3`, no: 2 },
    { label: `Бан ${teamSuffix(match, 'A')} (решающий)`, no: 3 },
  ]
}

function mapWord(count: number): string {
  if (count === 1) return 'карту'
  return 'карты'
}

function stageStatus(activeRoundNo: number, stageNo: number) {
  if (activeRoundNo > stageNo) return 'done'
  if (activeRoundNo === stageNo) return 'active'
  return 'upcoming'
}

function useCountdown(deadline: string) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)),
  )

  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return secondsLeft
}

export function VetoBoard({ match, players, rounds, votes, me, onChanged }: Props) {
  const activeRound = rounds.find((r) => !r.resolved)
  const secondsLeft = useCountdown(activeRound?.deadline ?? new Date().toISOString())
  const activeRoundId = activeRound?.id
  const pastDeadline = secondsLeft <= 0

  // resolve_round is a no-op unless the round is actually past its deadline
  // server-side (or fully voted), so a single call right as the client clock
  // hits 0 can silently do nothing (e.g. client slightly ahead of server).
  // Keep retrying on an interval — cheap and idempotent — until this round
  // stops being the active one (i.e. it actually resolved).
  useEffect(() => {
    if (!activeRoundId || !pastDeadline) return
    let cancelled = false
    const attempt = () => {
      supabase.rpc('resolve_round', { p_round_id: activeRoundId }).then(({ error }) => {
        if (error) console.error(error)
        if (!cancelled) onChanged()
      })
    }
    attempt()
    const id = setInterval(attempt, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [activeRoundId, pastDeadline, onChanged])

  const bannedMaps = new Set(rounds.filter((r) => r.kind === 'ban' && r.resolved).flatMap((r) => r.results))
  const pickedMap = rounds.find((r) => r.kind === 'pick_map' && r.resolved)?.results?.[0] ?? null

  const myVotesForActiveRound = activeRound
    ? votes.filter((v) => v.round_id === activeRound.id && v.player_id === me?.id)
    : []
  const myChoices = new Set(myVotesForActiveRound.map((v) => v.choice))
  const remainingPicks = activeRound ? activeRound.pick_count - myVotesForActiveRound.length : 0
  const canPickMore = !!activeRound && (remainingPicks > 0 || activeRound.pick_count === 1)
  const iAmActingTeam =
    !!me && !!activeRound && players.some((p) => p.team === activeRound.team && p.player_id === me.id)

  async function vote(choice: string) {
    if (!activeRound) return
    const { error } = await supabase.rpc('cast_vote', { p_round_id: activeRound.id, p_choice: choice })
    if (error) console.error(error)
    else onChanged()
  }

  function voteCountFor(choice: string): number {
    if (!activeRound) return 0
    return votes.filter((v) => v.round_id === activeRound.id && v.choice === choice).length
  }

  function votersFor(choice: string): string[] {
    if (!activeRound) return []
    return votes
      .filter((v) => v.round_id === activeRound.id && v.choice === choice)
      .map((v) => players.find((p) => p.player_id === v.player_id)?.profile?.name ?? '?')
  }

  function renderRoster(team: Team) {
    const label = teamLabel(match, team)
    const members = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className="roster">
        <h3>{label}</h3>
        {members.map((m) => {
          const memberVotes = activeRound
            ? votes.filter((v) => v.round_id === activeRound.id && v.player_id === m.player_id).length
            : 0
          const done = !!activeRound && memberVotes === activeRound.pick_count
          return (
            <div key={m.slot} className="roster-row">
              <span className={`roster-dot ${done && activeRound?.team === team ? 'roster-dot--voted' : ''}`} />
              <PlayerLink playerId={m.player_id}>{m.profile?.name ?? '—'}</PlayerLink>
              {match.tournament_id && m.slot === 0 && m.player_id && (
                <span className="captain-tag" title="Капитан">
                  👑
                </span>
              )}
              {activeRound && activeRound.team === team && activeRound.pick_count > 1 && m.player_id && (
                <span className="roster-progress">
                  {memberVotes}/{activeRound.pick_count}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <div className="stage-bar">
        {stages(match).map((s) => {
          const status = activeRound ? stageStatus(activeRound.round_no, s.no) : 'done'
          return (
            <div key={s.label} className={`stage-step stage-step--${status}`}>
              {s.label}
            </div>
          )
        })}
      </div>

      {activeRound && (
        <>
          <h2 className="round-heading">
            {activeRound.kind === 'ban' && (
              <>
                <span className={`team-tag--${activeRound.team}`}>{teamLabel(match, activeRound.team)}</span> банит{' '}
                {activeRound.pick_count} {mapWord(activeRound.pick_count)}
              </>
            )}
            {activeRound.kind === 'pick_map' && (
              <>
                <span className={`team-tag--${activeRound.team}`}>{teamLabel(match, activeRound.team)}</span>{' '}
                выбирает карту
              </>
            )}
          </h2>
          <p className="timer">
            {iAmActingTeam
              ? canPickMore
                ? activeRound.pick_count > 1
                  ? `Выберите ещё ${remainingPicks} из ${activeRound.pick_count} — осталось ${secondsLeft}с`
                  : `Голосуйте — осталось ${secondsLeft}с`
                : `Голос учтён (${myVotesForActiveRound.length}/${activeRound.pick_count}) — ждём остальных (${secondsLeft}с)`
              : `Голосует ${teamLabel(match, activeRound.team)} — ${secondsLeft}с`}
          </p>
        </>
      )}

      <div className="veto-body">
        {renderRoster('A')}

        <div className="map-grid">
          {match.map_pool.map((code) => {
            const map = mapByCode(code) ?? { code, name: code, image: '' }
            const isBanned = bannedMaps.has(map.code)
            const isResult = pickedMap === map.code
            const isCandidate = !!activeRound && activeRound.options.includes(map.code)
            const isClickable = isCandidate && iAmActingTeam && (myChoices.has(map.code) || canPickMore)
            const votedByMe = myChoices.has(map.code)
            const voters = isCandidate && !isBanned ? votersFor(map.code) : []
            return (
              <div
                key={map.code}
                className={[
                  'map-card',
                  isBanned ? 'map-card--banned' : '',
                  isResult ? 'map-card--result' : '',
                  isClickable ? 'map-card--clickable' : '',
                  votedByMe ? 'map-card--voted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => isClickable && vote(map.code)}
              >
                <img src={map.image} alt={map.name} />
                {isCandidate && !isBanned && <span className="map-card-votes">{voteCountFor(map.code)}</span>}
                {votedByMe && isClickable && <span className="map-card-unvote-hint">Убрать голос</span>}
                <span className="map-card-label">
                  {map.name}
                  {voters.length > 0 && <span className="map-card-voters">{voters.join(', ')}</span>}
                </span>
              </div>
            )
          })}
        </div>

        {renderRoster('B')}
      </div>
    </div>
  )
}
