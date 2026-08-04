import { useEffect, useState } from 'react'

function currentHashPath(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function useHashRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(currentHashPath())

  useEffect(() => {
    const onHashChange = () => setPath(currentHashPath())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: string) => {
    window.location.hash = next
  }

  return [path, navigate]
}

export function matchRoomPath(path: string): string | null {
  const m = path.match(/^\/room\/([^/]+)$/)
  return m ? m[1] : null
}

export function matchPlayerPath(path: string): string | null {
  const m = path.match(/^\/player\/([^/]+)$/)
  return m ? m[1] : null
}

export function matchTournamentPath(path: string): string | null {
  const m = path.match(/^\/tournament\/([^/]+)$/)
  return m ? m[1] : null
}
