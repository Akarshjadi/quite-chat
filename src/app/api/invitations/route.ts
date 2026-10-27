import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

const inviteSchema = z.object({
  conversation_id: z.string().uuid(),
  invited_email: z.string().email().optional(),
  // 24 hours default; cap 30 days.
  ttl_hours: z.coerce.number().min(1).max(720).default(24),
})

// POST /api/invitations — owner (or service flow) mints a single-use invite.
// The raw token is returned to the caller exactly once; only the hash is stored.
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = inviteSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const { conversation_id, invited_email, ttl_hours } = parsed.data

    const supabase = createServiceClient()
    const nodeCrypto = await import("node:crypto")
    const rawToken = nodeCrypto.randomBytes(32).toString("hex")
    const tokenHash = nodeCrypto.createHash("sha256").update(rawToken).digest("hex")

    const { error } = await supabase.from("invitations").insert({
      token_hash: tokenHash,
      conversation_id,
      invited_email: invited_email ?? null,
      created_by: user.id,
      expires_at: new Date(Date.now() + ttl_hours * 3600 * 1000).toISOString(),
    })

    if (error) {
      return NextResponse.json({ error: "create_failed" }, { status: 500 })
    }

    const acceptUrl = new URL("/invite/accept", process.env.APP_BASE_URL ?? "http://localhost:3000")
    // Fragment keeps the token out of the server request/referrer.
    acceptUrl.hash = rawToken

    return NextResponse.json(
      { invite_url: acceptUrl.toString(), token: rawToken },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

// GET /api/invitations?conversation_id= — list for the owner only.
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const conversation_id = url.searchParams.get("conversation_id")
    if (!conversation_id) {
      return NextResponse.json({ error: "conversation_id_required" }, { status: 400 })
    }
    const supabase = createServiceClient()
    const { data: conv } = await supabase
      .from("conversations")
      .select("created_by")
      .eq("id", conversation_id)
      .maybeSingle()
    if (!conv || conv.created_by !== user.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 })
    }
    const { data, error } = await supabase
      .from("invitations")
      .select("id, invited_email, created_at, expires_at, accepted_at, revoked_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: "db_error" }, { status: 500 })
    return NextResponse.json({ invitations: data ?? [] })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

// DELETE /api/invitations/:id — revoke an invite.
export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

    const supabase = createServiceClient()
    const { data: inv } = await supabase
      .from("invitations")
      .select("id, created_by, conversation_id")
      .eq("id", id)
      .maybeSingle()
    if (!inv) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const { data: conv } = await supabase
      .from("conversations")
      .select("created_by")
      .eq("id", inv.conversation_id)
      .maybeSingle()
    if (!conv || conv.created_by !== user.id) {
      return NextResponse.json({ error: "not_owner" }, { status: 403 })
    }

    const { error } = await supabase
      .from("invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return NextResponse.json({ error: "revoke_failed" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
