import { createRedirectClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

// Only allow relative, same-app redirect targets to prevent open redirect.
function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/chat"
  const trimmed = raw.trim()
  if (!trimmed.startsWith("/")) return "/chat"
  // Reject protocol-relative and anything with embedded scheme.
  if (trimmed.startsWith("//") || /:/.test(trimmed.slice(0, trimmed.indexOf("/") === 0 ? 2 : 1))) {
    return "/chat"
  }
  return trimmed
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = safeRedirectPath(searchParams.get("next"))

  if (code) {
    cookies()
    const supabase = createRedirectClient().supabase
    await supabase.auth.exchangeCodeForSession(code)
  }

  redirect(next)
}
