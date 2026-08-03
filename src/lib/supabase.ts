import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set (see .env.example)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** roomId is optional — pass '' when logging in from the home page (no room yet). */
export function steamAuthUrl(roomId: string): string {
  const url = new URL(`${supabaseUrl}/functions/v1/steam-auth`)
  if (roomId) url.searchParams.set('room', roomId)
  return url.toString()
}
