"use client"

import { createClient } from "@/lib/supabase/browser"
import { useEffect, useState } from "react"

export default function SettingsPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [displayName, setDisplayName] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [supabase])

  async function loadData() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    setUser(session?.user ?? null)

    if (session?.user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()
      setProfile(data ?? null)
      setDisplayName(data?.display_name ?? "")
    }
    setLoading(false)
  }

  async function saveName() {
    if (!user) return
    await supabase.from("profiles").upsert({
      id: user.id,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    })
  }

  if (loading) return <div className="p-6 text-[#AAB6C8]">Loading…</div>

  return (
    <div className="min-h-screen bg-[#111827] text-[#F3F4F6] p-6">
      <h1 className="text-2xl font-light mb-6">Settings</h1>

      <div className="max-w-md bg-[#1F2937] p-6 rounded-2xl border border-[#374151]">
        <label className="block text-sm text-[#AAB6C8] mb-1">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full bg-[#111827] border border-[#374151] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#D8C6A1]"
        />
        <button
          onClick={saveName}
          className="mt-4 px-4 py-2 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl hover:bg-[#e8d6b9] transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  )
}