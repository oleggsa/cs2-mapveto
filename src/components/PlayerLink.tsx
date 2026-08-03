import type { ReactNode } from 'react'

interface Props {
  playerId: string | null | undefined
  className?: string
  children: ReactNode
}

export function PlayerLink({ playerId, className, children }: Props) {
  if (!playerId) return <span className={className}>{children}</span>
  return (
    <a className={className} href={`#/player/${playerId}`}>
      {children}
    </a>
  )
}
