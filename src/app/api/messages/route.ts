import { NextResponse } from "next/server"
import { requireUser, requireMembership, AuthError, MembershipError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

const sendSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1).max(5000),
  client_message_id: z.string().uuid().optional(),
  reply_to_id: z.string().uuid().optional(),
})

const pageSchema = z.object({
  conversation_id: z.string().uuid(),
  limit: z.coerce.number().min(1).max(100).default(50),
  // cursor encodes `${created_at}:${id}` for stable chronological pagination.
  cursor: z.string().optional(),
})

type Params = { params: { conversation_id: string } }

function toCursor(row: { created_at: string; id: string }) {
  return `${row.created_at}:${row.id}`
}

async function getConversationOwner(conversationId: string, userId: string) {
  const supabase = createServiceClient()
  const { data: conv } = await supabase
    .from("conversations")
    .select("created_by")
    .eq("id", conversationId)
    .maybeSingle()
  return { conv }
}

// GET /api/messages?conversation_id=...&limit=&cursor=
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const parsed = pageSchema.safeParse({
      conversation_id: url.searchParams.get("conversation_id"),
      limit: url.searchParams.get("limit"),
      cursor: url.searchParams.get("cursor") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query" }, { status: 400 })
    }
    const { conversation_id, limit, cursor } = parsed.data

    await requireMembership(conversation_id, user.id)

    const supabase = createServiceClient()
    let query = supabase
      .from("messages")
      .select("id, body, sender_id, reply_to_id, client_message_id, created_at, deleted_at")
      .eq("conversation_id", conversation_id)
      .eq("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(limit)

    if (cursor) {
      const [ts, id] = cursor.split(":")
      if (ts && id) {
        query = query.or(`created_at.gt.${ts},created_at.eq.${ts}.and.id.gt.${id}`)
      }
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 })

    const rows = data ?? []
    const nextCursor =
      rows.length === limit && rows.length > 0 ? toCursor(rows[rows.length - 1]) : null

    return NextResponse.json({
      messages: rows,
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
    })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    if (e instanceof MembershipError) return NextResponse.json({ error: "not_a_member" }, { status: 403 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

// POST /api/messages  — send a message; sender is derived from the session.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = sendSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const { conversation_id, body, client_message_id, reply_to_id } = parsed.data

    await requireMembership(conversation_id, user.id)

    // Validate reply target belongs to the same conversation.
    if (reply_to_id) {
      const sup = createServiceClient()
      const { data: reply } = await sup
        .from("messages")
        .select("conversation_id")
        .eq("id", reply_to_id)
        .maybeSingle()
      if (!reply || reply.conversation_id !== conversation_id) {
        return NextResponse.json({ error: "invalid_reply_target" }, { status: 400 })
      }
    }

    const supabase = createServiceClient()
    // sender is the verified session user, never the client-supplied value.
    const insertPayload: Record<string, unknown> = {
      conversation_id,
      body,
      sender_id: user.id,
    }
    if (client_message_id) insertPayload.client_message_id = client_message_id
    if (reply_to_id) insertPayload.reply_to_id = reply_to_id

    const { data, error } = await supabase
      .from("messages")
      .insert([insertPayload])
      .select("id, body, sender_id, reply_to_id, client_message_id, created_at")
      .single()

    if (error) {
      // Duplicate client_message_id is an idempotency win: return the existing row.
      if (error.code === "23505" && client_message_id) {
        const existing = await supabase
          .from("messages")
          .select("id, body, sender_id, reply_to_id, client_message_id, created_at")
          .eq("sender_id", user.id)
          .eq("client_message_id", client_message_id)
          .maybeSingle()
        if (existing.data) {
          return NextResponse.json({ message: existing.data, deduplicated: true }, { status: 200 })
        }
      }
      return NextResponse.json({ error: "send_failed" }, { status: 400 })
    }

    return NextResponse.json({ message: data, deduplicated: false }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    if (e instanceof MembershipError) return NextResponse.json({ error: "not_a_member" }, { status: 403 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
