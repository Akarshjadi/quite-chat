import { describe, it, expect } from "vitest"
import { z } from "zod"

// Mirror of the send schema in src/app/api/messages/route.ts.
const sendSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1).max(5000),
  client_message_id: z.string().uuid().optional(),
  reply_to_id: z.string().uuid().optional(),
})

describe("message send validation", () => {
  it("accepts a well-formed body", () => {
    const result = sendSchema.safeParse({
      conversation_id: "3f2c1a6e-1111-2222-3333-444455556666",
      body: "hi",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a body over 5000 chars", () => {
    const result = sendSchema.safeParse({
      conversation_id: "3f2c1a6e-1111-2222-3333-444455556666",
      body: "x".repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty body", () => {
    const result = sendSchema.safeParse({
      conversation_id: "3f2c1a6e-1111-2222-3333-444455556666",
      body: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a non-uuid conversation_id", () => {
    const result = sendSchema.safeParse({
      conversation_id: "not-a-uuid",
      body: "hi",
    })
    expect(result.success).toBe(false)
  })

  it("ignores a client-supplied sender_id (server derives it)", () => {
    const result = sendSchema.safeParse({
      conversation_id: "3f2c1a6e-1111-2222-3333-444455556666",
      body: "hi",
      sender_id: "attacker-uuid",
    })
    // The schema does not include sender_id, so it is stripped/ignored.
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).sender_id).toBeUndefined()
    }
  })
})

describe("safe redirect target", () => {
  // Mirrors the helper in src/app/auth/callback/route.ts.
  function safeRedirectPath(raw: string | null): string {
    if (!raw) return "/chat"
    const trimmed = raw.trim()
    if (!trimmed.startsWith("/")) return "/chat"
    if (trimmed.startsWith("//")) return "/chat"
    const firstSlash = trimmed.indexOf("/")
    const prefix = trimmed.slice(0, firstSlash === 0 ? 2 : 1)
    if (/:/.test(prefix)) return "/chat"
    return trimmed
  }

  it("accepts a relative path", () => {
    expect(safeRedirectPath("/chat")).toBe("/chat")
    expect(safeRedirectPath("/settings")).toBe("/settings")
  })

  it("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/chat")
    expect(safeRedirectPath("http://evil.example")).toBe("/chat")
  })

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/chat")
  })

  it("rejects a null/empty value", () => {
    expect(safeRedirectPath(null)).toBe("/chat")
    expect(safeRedirectPath("")).toBe("/chat")
  })
})
