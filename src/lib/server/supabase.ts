import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Server-only Supabase client backed by the service role.
 * NEVER import from client components. The service key must stay out of the
 * browser bundle.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServerClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Server client that resolves the requesting user's Supabase session from
 * their cookies. Used for reads that must be governed by RLS.
 */
export function createAuthenticatedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const cookieStore = cookies()
  return createServerClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      cookies: {
        getAll() {
          return Array.from(cookieStore.getAll())
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, safe to ignore.
          }
        },
      },
    },
  })
}
