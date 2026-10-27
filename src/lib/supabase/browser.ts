import { createBrowserClient } from "@supabase/ssr"

// Fallbacks keep static builds (CI, no env vars) from crashing at module
// load. In dev/prod the real values are provided via NEXT_PUBLIC_* env.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co"
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"

export function createClient() {
  return createBrowserClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
}
