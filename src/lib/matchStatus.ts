import type { MatchStatus } from '../types'

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  lobby: 'Сбор игроков',
  scheduled: 'Ожидает старта',
  veto: 'Идёт вето',
  done: 'Завершён',
  cancelled: 'Отменён',
}
