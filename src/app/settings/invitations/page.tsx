"use client"

import { createClient } from "@/lib/supabase/browser"
import { useEffect, useState } from "react"

interface Invitation {
  id: string
  invited_email: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export default function OwnerInvitationsPage() {
  const supabase = createClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [copyUrl, setCopyUrl] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      setLoading(false)
      return
    }
    const { data: members } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", session.user.id)
      .limit(1)
    const convId = members?.[0]?.conversation_id ?? null
    setConversationId(convId)

    if (!convId) {
      setLoading(false)
      return
    }

    const { data: conv } = await supabase
      .from("conversations")
      .select("created_by")
      .eq("id", convId)
      .single()
    setIsOwner(conv?.created_by === session.user.id)

    if (conv?.created_by === session.user.id) {
      const { data: invs } = await supabase
        .from("invitations")
        .select("id, invited_email, created_at, expires_at, accepted_at, revoked_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
      setInvitations((invs as Invitation[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  async function createInvitation() {
    setError("")
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ conversation_id: conversationId, ttl_hours: 24 }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setCopyUrl(body.invite_url ?? "")
      load()
    } else {
      setError(body.error ?? "Could not create invitation.")
    }
  }

  async function revoke(id: string) {
    const res = await fetch(
      `/api/invitations?conversation_id=${conversationId}&id=${id}`,
      { method: "DELETE", credentials: "same-origin" }
    )
    if (res.ok) load()
    else setError((await res.json().catch(() => ({}))).error ?? "Could not revoke.")
  }

  if (loading) return <div className="p-6 text-[#AAB6C8]">Loading…</div>

  if (!isOwner) {
    return (
      <div className="p-6">
        <p className="text-[#AAB6C8]">Only the room owner can manage invitations.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111827] text-[#F3F4F6] p-6">
      <h1 className="text-2xl font-light mb-6">Invitations</h1>

      <div className="max-w-lg space-y-4">
        <button
          onClick={createInvitation}
          className="px-5 py-2.5 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl"
        >
          Create invitation link
        </button>

        {copyUrl && (
          <div className="text-xs text-[#AAB6C8] space-y-2">
            <p>Copy this link (single use, 24h). Share it with the second participant.</p>
            <textarea
              readOnly
              value={copyUrl}
              className="w-full bg-[#1F2937] border border-[#374151] rounded-xl p-3 text-white text-xs"
            />
            <button
              onClick={() => navigator.clipboard?.writeText(copyUrl)}
              className="text-[#D8C6A1] underline"
            >
              Copy
            </button>
          </div>
        )}

        {error && <p className="text-xs text-[#EF4444]">{error}</p>}

        {invitations.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm text-[#AAB6C8]">Existing invitations</h2>
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-[#1F2937] border border-[#374151] rounded-xl p-3 flex items-center justify-between text-xs"
              >
                <span>
                  {new Date(inv.created_at).toLocaleString()}
                  {inv.revoked_at ? " · revoked" : inv.accepted_at ? " · accepted" : ""}
                </span>
                {!inv.revoked_at && !inv.accepted_at && (
                  <button onClick={() => revoke(inv.id)} className="text-[#EF4444]">
                    revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
