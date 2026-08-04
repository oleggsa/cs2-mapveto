import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set (see .env.example)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** returnPath is the hash-route path to bounce back to after login (e.g.
 * `/room/:id`, `/tournament/:id`, `/player/:id`) — pass '' from the home page. */
export function steamAuthUrl(returnPath: string): string {
  const url = new URL(`${supabaseUrl}/functions/v1/steam-auth`)
  if (returnPath) url.searchParams.set('path', returnPath)
  // Tells the edge function where to bounce back to after Steam login — lets
  // this work from localhost during development, not just the deployed site.
  url.searchParams.set('dest', window.location.origin + import.meta.env.BASE_URL)
  return url.toString()
}
