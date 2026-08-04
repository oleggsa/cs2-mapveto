import { useEffect, useRef, useState } from 'react'

interface Props {
  onSelectMatch: () => void
  onSelectTournament: () => void
  disabled?: boolean
}

export function CreateMenu({ onSelectMatch, onSelectTournament, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="create-menu" ref={rootRef}>
      <button className="create-menu-trigger" onClick={() => setOpen((v) => !v)} disabled={disabled}>
        {disabled ? 'Создаём…' : 'Создать'}
      </button>
      {open && (
        <div className="create-menu-dropdown">
          <button
            className="create-menu-item"
            onClick={() => {
              setOpen(false)
              onSelectMatch()
            }}
          >
            Матч
          </button>
          <button
            className="create-menu-item"
            onClick={() => {
              setOpen(false)
              onSelectTournament()
            }}
          >
            Турнир
          </button>
        </div>
      )}
    </div>
  )
}
