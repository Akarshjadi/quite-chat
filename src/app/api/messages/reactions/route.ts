import { NextResponse } from "next/server"
import { requireUser, requireMembership, AuthError, MembershipError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

// POST /api/messages/:id/reactions  body: { message_id, emoji, remove? }
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const messageId = url.searchParams.get("message_id")
    const raw: unknown = await request.json().catch(() => null)
    const parsed = z
      .object({
        emoji: z.string().min(1).max(8),
        remove: z.boolean().optional(),
      })
      .safeParse(raw)
    if (!messageId || !parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: msg } = await supabase
      .from("messages")
      .select("conversation_id, sender_id")
      .eq("id", messageId)
      .maybeSingle()
    if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 })

    await requireMembership(msg.conversation_id, user.id)

    const target = parsed.data
    if (target.remove) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", target.emoji)
      if (error) return NextResponse.json({ error: "remove_failed" }, { status: 500 })
      return NextResponse.json({ ok: true, removed: true })
    }

    const { error } = await supabase.from("message_reactions").upsert(
      { message_id: messageId, user_id: user.id, emoji: target.emoji },
      { onConflict: "message_id,user_id,emoji" }
    )
    if (error) return NextResponse.json({ error: "add_failed" }, { status: 500 })
    return NextResponse.json({ ok: true, added: true }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    if (e instanceof MembershipError) return NextResponse.json({ error: "not_a_member" }, { status: 403 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

// GET /api/messages/:id/reactions
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const messageId = url.searchParams.get("message_id")
    if (!messageId) return NextResponse.json({ error: "message_id_required" }, { status: 400 })

    const supabase = createServiceClient()
    const { data: msg } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("id", messageId)
      .maybeSingle()
    if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 })
    await requireMembership(msg.conversation_id, user.id)

    const { data, error } = await supabase
      .from("message_reactions")
      .select("id, user_id, emoji, created_at")
      .eq("message_id", messageId)
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 })
    return NextResponse.json({ reactions: data ?? [] })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    if (e instanceof MembershipError) return NextResponse.json({ error: "not_a_member" }, { status: 403 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
