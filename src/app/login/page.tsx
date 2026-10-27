"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/browser"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)
    if (err) {
      setError("Invalid email or password. Please try again.")
      return
    }

    router.push("/chat")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111827] px-4">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-2xl font-light text-[#F3F4F6]">Welcome back</h1>
          <p className="text-[#AAB6C8] mt-1">Sign in to your chat</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm text-[#AAB6C8] mb-1">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full bg-[#1F2937] border border-[#374151] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#D8C6A1]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-[#AAB6C8] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full bg-[#1F2937] border border-[#374151] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#D8C6A1]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-[#EF4444] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl disabled:opacity-50 hover:!bg-[#e8d6b9] transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}