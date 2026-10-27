import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options })
        },
      },
    }
  )
}

export function createRedirectClient() {
  const cookieStore = cookies()
  const supabase = createClient()

  const redirect = async (path: string) => {
    const response = NextResponse.redirect(new URL(path, process.env.NEXT_PUBLIC_SUPABASE_URL!))
    // Copy cookies from response to ensure auth cookies persist
    return response
  }

  return { supabase, redirect }
}