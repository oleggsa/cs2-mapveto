import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

// If the URL carries a Steam-login token (dropped there by the steam-auth edge
// function), redeem it for a real Supabase session, then scrub it from the URL.
async function consumeLoginToken() {
  const url = new URL(window.location.href)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  if (!tokenHash || !type) return

  await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' })

  url.searchParams.delete('token_hash')
  url.searchParams.delete('type')
  window.history.replaceState({}, '', url.toString())
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    consumeLoginToken()
      .catch((err) => console.error('Steam login token exchange failed', err))
      .finally(async () => {
        const { data } = await supabase.auth.getSession()
        if (active) setSession(data.session)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!session?.user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setProfile(data ?? null)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [session?.user?.id])

  return { session, profile, loading }
}
