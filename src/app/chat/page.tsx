"use client"

import { createClient } from "@/lib/supabase/browser"
import { useCallback, useEffect, useRef, useState } from "react"

interface Message {
  id: string
  body: string
  sender_id: string
  conversation_id: string
  reply_to_id?: string | null
  client_message_id?: string | null
  created_at: string
  deleted_at?: string | null
}

export default function ChatPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [pending, setPending] = useState<Message[]>([])
  const [failed, setFailed] = useState<Message[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const isOwn = (m: Message) => m.sender_id === user?.id

  // Resolve the user's single conversation.
  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)

      if (session?.user) {
        const { data: members } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", session.user.id)
          .limit(1)
        const convId = members?.[0]?.conversation_id ?? null
        setConversationId(convId)
        if (convId) {
          await loadMessages(convId)
        } else {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const loadMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100)
    if (!error && data) {
      setMessages(data as unknown as Message[])
    }
    setLoading(false)
  }

  // Room-scoped realtime: subscribe to a private channel keyed by the room
  // id and filter to that room's rows. Anon/other-room clients cannot join.
  useEffect(() => {
    if (!conversationId || !user) return
    const channel = supabase
      .channel(`room-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as unknown as Message
          if (row.conversation_id !== conversationId) return
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          )
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.old as unknown as Message
          if (row.conversation_id !== conversationId) return
          setMessages((prev) => prev.filter((m) => m.id !== row.id))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user])

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Reconnect / missed-message recovery: on visibilitychange or focus,
  // refetch from the DB so a dropped realtime stream never causes a gap.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible" && conversationId) {
        loadMessages(conversationId)
      }
    }
    document.addEventListener("visibilitychange", handler)
    window.addEventListener("focus", handler)
    return () => {
      document.removeEventListener("visibilitychange", handler)
      window.removeEventListener("focus", handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const body = input.trim()
      if (!body || !user || !conversationId || sending) return

      setSending(true)
      const clientMessageId = crypto.randomUUID()
      const optimistic: Message = {
        id: `pending-${clientMessageId}`,
        body,
        sender_id: user.id,
        conversation_id: conversationId,
        client_message_id: clientMessageId,
        reply_to_id: replyTo?.id ?? null,
        created_at: new Date().toISOString(),
      }
      setPending((p) => [...p, optimistic])
      setInput("")
      setReplyTo(null)

      try {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            body,
            conversation_id: conversationId,
            sender_id: user.id,
            client_message_id: clientMessageId,
            reply_to_id: optimistic.reply_to_id ?? null,
          })
          .select()
          .single()

        if (error) {
          // Retry: mark failed, do not silently drop.
          setFailed((f) => [...f, optimistic])
          setPending((p) => p.filter((m) => m.client_message_id !== clientMessageId))
        } else {
          const committed = data as unknown as Message
          setMessages((prev) =>
            prev.some((m) => m.id === committed.id) ? prev : [...prev, committed]
          )
          setPending((p) => p.filter((m) => m.client_message_id !== clientMessageId))
        }
      } finally {
        setSending(false)
      }
    },
    [input, user, conversationId, sending, replyTo, supabase]
  )

  const retry = useCallback(
    async (m: Message) => {
      setFailed((f) => f.filter((x) => x.id !== m.id))
      setPending((p) => [...p, m])
      const { data, error } = await supabase
        .from("messages")
        .insert({
          body: m.body,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          client_message_id: m.client_message_id ?? undefined,
          reply_to_id: m.reply_to_id ?? null,
        })
        .select()
        .single()
      if (error) {
        setFailed((f) => [...f, m])
      } else {
        setMessages((prev) =>
          prev.some((x) => x.client_message_id === m.client_message_id)
            ? prev
            : [...prev, data as unknown as Message]
        )
      }
      setPending((p) => p.filter((x) => x.id !== m.id))
    },
    [supabase]
  )

  const allRows = [
    ...messages.filter((m) => !pending.some((p) => p.client_message_id === m.client_message_id)),
    ...pending,
  ].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

  return (
    <div className="min-h-screen bg-[#111827] text-[#F3F4F6] flex flex-col">
      <header className="border-b border-[#374151] bg-[#1F2937] px-6 py-4">
        <h1 className="text-xl font-medium">Between the Lines</h1>
        <p className="text-xs text-[#AAB6C8] mt-0.5">private conversation</p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-3">
        {loading ? (
          <div className="text-center text-[#AAB6C8]">Loading…</div>
        ) : allRows.length === 0 ? (
          <div className="text-center text-[#AAB6C8]">
            No messages yet. Start the conversation.
          </div>
        ) : (
          <>
            {allRows.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${isOwn(msg) ? "items-end" : "items-start"}`}
              >
                <div
                  className={`chat-bubble ${isOwn(msg) ? "chat-bubble-own" : "chat-bubble-other"}`}
                >
                  {msg.reply_to_id && (
                    <div className="text-xs text-[#AAB6C8] mb-1 border-l-2 border-[#D8C6A1] pl-2">
                      Replying to a message
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                </div>
                <div className="text-[10px] text-[#AAB6C8] mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}

            {failed.length > 0 && (
              <div className="mt-4 space-y-2">
                {failed.map((m) => (
                  <div key={m.id} className="text-xs text-[#EF4444] flex items-center gap-2">
                    <span>Failed to send &ldquo;{m.body.slice(0, 40)}&rdquo;</span>
                    <button
                      onClick={() => retry(m)}
                      className="text-[#D8C6A1] underline"
                    >
                      retry
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </main>

      <footer className="border-t border-[#374151] bg-[#111827] px-4 sm:px-6 py-3 sm:py-4 sticky bottom-0">
        {replyTo && (
          <div className="text-xs text-[#AAB6C8] mb-2 flex items-center gap-2">
            Replying to &ldquo;{replyTo.body.slice(0, 60)}&rdquo;
            <button onClick={() => setReplyTo(null)} className="text-[#D8C6A1] underline">
              cancel
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!user}
            className="flex-1 bg-[#1F2937] border border-[#374151] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#D8C6A1]"
            placeholder="Write a message…"
            maxLength={5000}
          />
          <button
            type="submit"
            disabled={!input.trim() || !user || sending}
            className="px-5 py-2.5 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </footer>
    </div>
  )
}
