import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface Props {
  profile: Profile
}

export function UserBadge({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="user-badge" ref={rootRef}>
      <button className="user-badge-trigger" onClick={() => setOpen((v) => !v)}>
        {profile.avatar_url ? (
          <img className="user-badge-avatar" src={profile.avatar_url} alt="" />
        ) : (
          <span className="user-badge-avatar" />
        )}
        <span className="user-badge-name">{profile.name}</span>
      </button>
      {open && (
        <div className="user-badge-menu">
          <button className="user-badge-logout" onClick={logout}>
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}
