import { createRedirectClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/chat"

  if (code) {
    const cookieStore = cookies()
    const supabase = createRedirectClient().supabase
    await supabase.auth.exchangeCodeForSession(code)
  }

  redirect(next)
}