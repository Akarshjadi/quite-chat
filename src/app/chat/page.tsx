import { createClient } from "@/lib/supabase/browser"
import { useEffect, useState, useRef, useCallback } from "react"

export default function ChatPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useCallback(
    (node: HTMLElement | null) => {
      if (node) {
        node.scrollIntoView({ behavior: "smooth" })
      }
    },
    []
  )

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadMessages()
      } else {
        setLoading(false)
      }
    }

    loadSession()
  }, [supabase])

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50)

    if (!error && data) {
      setMessages(data)
    }
    setLoading(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !user || sending) return

    setSending(true)
    const client_message_id = crypto.randomUUID()

    const { error } = await supabase.from("messages").insert({
      body: input.trim(),
      sender_id: user.id,
      client_message_id,
    })

    if (!error) {
      setInput("")
    }
    setSending(false)
  }

  const { data: channel } = supabase
    .channel("messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      setMessages((prev) => [...prev, payload.new as any])
    })
    .subscribe()

  return (
    <div className="min-h-screen bg-[#111827] text-[#F3F4F6] flex flex-col">
      <header className="border-b border-[#374151] bg-[#1F2937] px-6 py-4">
        <h1 className="text-xl font-medium">Quite Chat</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8 space-y-4">
        {loading ? (
          <div className="text-center text-[#AAB6C8]">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-[#AAB6C8]">
            No messages yet. Start the conversation.
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`chat-bubble ${
                    msg.sender_id === user.id ? "chat-bubble-own" : "chat-bubble-other"
                  }`}
                >
                  {msg.body}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      <footer className="border-t border-[#374151] bg-[#111827] px-6 py-4 sticky bottom-0">
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!user}
            className="flex-1 bg-[#1F2937] border border-[#374151] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#D8C6A1]"
            placeholder="Write a message…"
          />
          <button
            type="submit"
            disabled={!input.trim() || !user || sending}
            className="px-6 py-2 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  )
}