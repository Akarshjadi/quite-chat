import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

// POST /api/messages/delete  body: { message_id }
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = z.object({ message_id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const messageId = parsed.data.message_id

    const supabase = createServiceClient()
    const { data: msg } = await supabase
      .from("messages")
      .select("id, sender_id, conversation_id")
      .eq("id", messageId)
      .maybeSingle()
    if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 })

    // Only the sender may soft-delete their own message.
    if (msg.sender_id !== user.id) {
      return NextResponse.json({ error: "not_sender" }, { status: 403 })
    }

    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
    if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
