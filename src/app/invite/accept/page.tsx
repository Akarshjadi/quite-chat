"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Result =
  | { state: "idle" }
  | { state: "working" }
  | { state: "success" }
  | { state: "error"; message: string }

export default function InviteAcceptPage() {
  const router = useRouter()
  const [result, setResult] = useState<Result>({ state: "idle" })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    // The token lives in the URL fragment (#token=...), which never reaches
    // the server in the initial request. Read it client-side, then POST it.
    const hash = window.location.hash
    const match = hash.match(/token=([^&]+)/)
    const token = match ? decodeURIComponent(match[1]) : null

    if (!token) {
      setResult({ state: "error", message: "No invitation token found." })
      return
    }

    setResult({ state: "working" })
    fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          // Clean the URL, then go to the chat.
          window.history.replaceState({}, document.title, window.location.pathname)
          setResult({ state: "success" })
          router.push("/chat")
        } else {
          setResult({
            state: "error",
            message: friendlyError(body.error as string | undefined),
          })
        }
      })
      .catch(() => {
        setResult({ state: "error", message: "Could not reach the server. Please try again." })
      })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111827] text-[#F3F4F6] px-6">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-light">Invitation</h1>

        {result.state === "working" && <p className="text-[#AAB6C8]">Accepting invitation…</p>}

        {result.state === "success" && (
          <p className="text-[#AAB6C8]">You are in. Redirecting to the chat…</p>
        )}

        {result.state === "error" && (
          <>
            <p className="text-[#EF4444]">{result.message}</p>
            <a href="/" className="text-[#D8C6A1] hover:underline text-sm">
              Go to home
            </a>
          </>
        )}

        {result.state === "idle" && <p className="text-[#AAB6C8]">Preparing…</p>}
      </div>
    </div>
  )
}

function friendlyError(code?: string): string {
  switch (code) {
    case "invitation_expired":
      return "This invitation has expired. Ask the sender for a new one."
    case "invitation_revoked":
      return "This invitation was revoked. Ask the sender for a new one."
    case "invitation_used":
      return "This invitation has already been used."
    case "room_full":
      return "The room already has two members."
    case "invalid_invitation":
      return "This invitation is not valid."
    case "not_authenticated":
      return "You need to sign in first to accept this invitation."
    default:
      return "Could not accept the invitation. Please try again."
  }
}
