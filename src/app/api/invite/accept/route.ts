import { NextResponse } from "next/server"
import { requireUser, AuthError } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/server/supabase"
import { z } from "zod"

export const runtime = "nodejs"

const acceptSchema = z.object({
  token: z.string().min(1),
})

// POST /invite/accept — exchange a single-use invitation token for membership.
// The token is the raw value returned by /api/invitations; we hash it here and
// run the transactional accept_invitation() DB function (RLS + two-member cap).
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw: unknown = await request.json().catch(() => null)
    const parsed = acceptSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const nodeCrypto = await import("node:crypto")
    const tokenHash = nodeCrypto.createHash("sha256").update(parsed.data.token).digest("hex")

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("accept_invitation", {
      p_token_hash: tokenHash,
      p_user: user.id,
    })

    if (error) {
      // Map DB exceptions to safe, non-leaking statuses.
      const msg = String(error.message ?? "")
      if (/revoked/i.test(msg)) return NextResponse.json({ error: "invitation_revoked" }, { status: 410 })
      if (/already used/i.test(msg)) return NextResponse.json({ error: "invitation_used" }, { status: 409 })
      if (/expired/i.test(msg)) return NextResponse.json({ error: "invitation_expired" }, { status: 410 })
      if (/unknown invitation/i.test(msg)) return NextResponse.json({ error: "invalid_invitation" }, { status: 404 })
      if (/two members/i.test(msg)) return NextResponse.json({ error: "room_full" }, { status: 409 })
      if (/not bound/i.test(msg)) return NextResponse.json({ error: "invitation_misconfigured" }, { status: 500 })
      return NextResponse.json({ error: "accept_failed" }, { status: 400 })
    }

    return NextResponse.json({ ok: true, invitation_id: data })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
