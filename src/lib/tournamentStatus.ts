import type { TournamentStatus } from '../types'

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  lobby: 'Сбор команд',
  in_progress: 'Идёт турнир',
  done: 'Завершён',
  cancelled: 'Отменён',
}
