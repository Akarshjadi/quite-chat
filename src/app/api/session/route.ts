import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"

export const runtime = "nodejs"

export async function GET() {
  try {
    const user = await requireUser()
    return NextResponse.json({ authenticated: true, user_id: user.id })
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}
