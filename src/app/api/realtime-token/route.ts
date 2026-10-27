import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

// POST /api/realtime-token  body: { conversation_id }
// Issues a short-lived, room-scoped realtime credential.
// For Supabase the "token" is a membership attestation; the client then
// subscribes to a private channel with a conversation_id filter so events
// are scoped to a single room.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = z.object({ conversation_id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const { conversation_id } = parsed.data

    const supabase = createServiceClient()
    const { data } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversation_id)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!data) {
      return NextResponse.json({ error: "not_a_member" }, { status: 403 })
    }

    const issuedAt = Date.now()
    const ttlMs = 10 * 60 * 1000
    return NextResponse.json({
      conversation_id,
      // Client uses this to build a channel key that includes the room id.
      channel_key: `rt:bt:conv:${conversation_id}`,
      issued_at: issuedAt,
      expires_at: issuedAt + ttlMs,
    })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
