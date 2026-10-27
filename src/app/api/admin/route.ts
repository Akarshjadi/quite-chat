import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

// POST /api/admin/revoke-session  body: { target_user_id }
// Owner revokes another participant's access by removing their membership,
// which cascades to sessions and blocks further realtime/DB access.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = z.object({ target_user_id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const target = parsed.data.target_user_id
    if (target === user.id) {
      return NextResponse.json({ error: "cannot_revoke_self" }, { status: 400 })
    }

    const supabase = createServiceClient()
    // Find the shared conversation that includes the target.
    const { data: targetMembers } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", target)
      .limit(1)
    const convId = targetMembers?.[0]?.conversation_id
    if (!convId) {
      return NextResponse.json({ error: "target_not_in_room" }, { status: 404 })
    }

    // Only the owner of the room may revoke.
    const { data: conv } = await supabase
      .from("conversations")
      .select("created_by")
      .eq("id", convId)
      .maybeSingle()
    if (!conv || conv.created_by !== user.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 })
    }

    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", convId)
      .eq("user_id", target)
    if (error) return NextResponse.json({ error: "revoke_failed" }, { status: 500 })

    return NextResponse.json({ ok: true, revoked_user_id: target })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

// POST /api/admin/delete-room  body: { conversation_id }
// Owner deletes the room and cascades membership/messages; membership removal
// also invalidates the participants' access per the documented policy.
export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = z.object({ conversation_id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const { conversation_id } = parsed.data

    const supabase = createServiceClient()
    const { data: conv } = await supabase
      .from("conversations")
      .select("created_by")
      .eq("id", conversation_id)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (conv.created_by !== user.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 })
    }

    // Cascade: deleting the conversation removes members, messages, reactions,
    // invitations (all on delete cascade) and thus all participants' access.
    const { error } = await supabase.from("conversations").delete().eq("id", conversation_id)
    if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
    return NextResponse.json({ ok: true, deleted_conversation_id: conversation_id })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
