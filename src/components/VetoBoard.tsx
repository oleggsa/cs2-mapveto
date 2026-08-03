import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mapByCode } from '../config/mapPool'
import type { Match, MatchPlayer, MatchRound, MatchVote, Profile, Team } from '../types'

interface Props {
  match: Match
  players: MatchPlayer[]
  rounds: MatchRound[]
  votes: MatchVote[]
  me: Profile
}

const STAGES = [
  { label: 'Бан A ×2', from: 1, to: 2 },
  { label: 'Бан B ×3', from: 3, to: 5 },
  { label: 'Пик карты A', from: 6, to: 6 },
  { label: 'Пик стороны B', from: 7, to: 7 },
]

function stageStatus(round_no: number, from: number, to: number) {
  if (round_no > to) return 'done'
  if (round_no >= from && round_no <= to) return 'active'
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

export function VetoBoard({ match, players, rounds, votes, me }: Props) {
  const activeRound = rounds.find((r) => !r.resolved)
  const secondsLeft = useCountdown(activeRound?.deadline ?? new Date().toISOString())
  const resolvedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!activeRound) return
    if (secondsLeft > 0) return
    if (resolvedFor.current === activeRound.id) return
    resolvedFor.current = activeRound.id
    supabase.rpc('resolve_round', { p_round_id: activeRound.id }).then(({ error }) => {
      if (error) console.error(error)
    })
  }, [activeRound, secondsLeft])

  const bannedMaps = new Set(
    rounds.filter((r) => r.kind === 'ban' && r.resolved && r.result).map((r) => r.result as string),
  )
  const pickedMap = rounds.find((r) => r.kind === 'pick_map' && r.resolved)?.result ?? null

  const myVoteForActiveRound = activeRound
    ? votes.find((v) => v.round_id === activeRound.id && v.player_id === me.id)
    : undefined
  const iAmActingTeam =
    !!activeRound && players.some((p) => p.team === activeRound.team && p.player_id === me.id)

  async function vote(choice: string) {
    if (!activeRound) return
    const { error } = await supabase.rpc('cast_vote', { p_round_id: activeRound.id, p_choice: choice })
    if (error) console.error(error)
  }

  function voteCountFor(choice: string): number {
    if (!activeRound) return 0
    return votes.filter((v) => v.round_id === activeRound.id && v.choice === choice).length
  }

  function renderRoster(team: Team) {
    const label = team === 'A' ? 'Команда A' : 'Команда B'
    const members = players.filter((p) => p.team === team).sort((a, b) => a.slot - b.slot)
    return (
      <div className="roster">
        <h3>{label}</h3>
        {members.map((m) => {
          const voted = !!activeRound && votes.some((v) => v.round_id === activeRound.id && v.player_id === m.player_id)
          return (
            <div key={m.slot} className="roster-row">
              <span className={`roster-dot ${voted && activeRound?.team === team ? 'roster-dot--voted' : ''}`} />
              <span>{m.profile?.name ?? '—'}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <div className="stage-bar">
        {STAGES.map((s) => {
          const status = activeRound ? stageStatus(activeRound.round_no, s.from, s.to) : 'done'
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
                <span className={`team-tag--${activeRound.team}`}>Команда {activeRound.team}</span> банит карту
              </>
            )}
            {activeRound.kind === 'pick_map' && (
              <>
                <span className={`team-tag--${activeRound.team}`}>Команда {activeRound.team}</span> выбирает карту
              </>
            )}
            {activeRound.kind === 'pick_side' && (
              <>
                <span className={`team-tag--${activeRound.team}`}>Команда {activeRound.team}</span> выбирает сторону
              </>
            )}
          </h2>
          <p className="timer">
            {iAmActingTeam
              ? myVoteForActiveRound
                ? `Голос учтён — ждём остальных (${secondsLeft}с)`
                : `Голосуйте — осталось ${secondsLeft}с`
              : `Голосует команда ${activeRound.team} — ${secondsLeft}с`}
          </p>
        </>
      )}

      <div className="veto-body">
        {renderRoster('A')}

        {activeRound?.kind === 'pick_side' ? (
          <div className="side-grid">
            {(['CT', 'T'] as const).map((side) => (
              <div
                key={side}
                className={`side-card side-card--${side.toLowerCase()} ${
                  myVoteForActiveRound?.choice === side ? 'side-card--voted' : ''
                }`}
                onClick={() => iAmActingTeam && !myVoteForActiveRound && vote(side)}
                style={{ cursor: iAmActingTeam && !myVoteForActiveRound ? 'pointer' : 'default' }}
              >
                {side === 'CT' ? 'CT' : 'T'} ({voteCountFor(side)})
              </div>
            ))}
          </div>
        ) : (
          <div className="map-grid">
            {match.map_pool.map((code) => {
              const map = mapByCode(code) ?? { code, name: code, image: '' }
              const isBanned = bannedMaps.has(map.code)
              const isResult = pickedMap === map.code
              const isCandidate = !!activeRound && activeRound.options.includes(map.code)
              const isClickable = isCandidate && iAmActingTeam && !myVoteForActiveRound
              const votedByMe = myVoteForActiveRound?.choice === map.code
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
                  <span className="map-card-label">{map.name}</span>
                </div>
              )
            })}
          </div>
        )}

        {renderRoster('B')}
      </div>
    </div>
  )
}
