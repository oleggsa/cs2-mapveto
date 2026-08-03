import { mapByCode } from '../config/mapPool'
import type { Match } from '../types'

interface Props {
  match: Match
}

export function ResultScreen({ match }: Props) {
  const map = match.final_map ? mapByCode(match.final_map) : undefined

  return (
    <div className="result-card">
      {map && <img src={map.image} alt={map.name} />}
      <div className="result-card-body">
        <h2>{map?.name ?? match.final_map}</h2>
        {match.starting_side && (
          <div className="result-side">
            Команда B начинает за {match.starting_side === 'CT' ? 'CT' : 'T'}
          </div>
        )}
      </div>
    </div>
  )
}
