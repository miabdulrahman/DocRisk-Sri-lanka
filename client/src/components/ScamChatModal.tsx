import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, User, X } from 'lucide-react'
import type { ScamEntry } from '../utils/scamData'
import { getApiBase } from '../lib/apiBase'
import './ScamChatModal.css'

interface ChatMessage {
  sender: 'user' | 'ai'
  text: string
}

interface GeminiPart {
  text: string
}

interface GeminiHistoryMsg {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface Props {
  scam: ScamEntry
  onClose: () => void
}

function initialGreeting(scam: ScamEntry): string {
  return `Hello! I'm your DocRisk AI expert specialised in Sri Lankan cybersecurity and fraud prevention. I'm here to help you understand the "${scam.title}" and how to protect yourself or someone you know. What would you like to know?`
}

export function ScamChatModal({ scam, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { sender: 'ai', text: initialGreeting(scam) },
  ])
  const [geminiHistory, setGeminiHistory] = useState<GeminiHistoryMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { sender: 'user', text }])
    setInput('')
    setLoading(true)

    const outgoingHistory: GeminiHistoryMsg[] = [
      ...geminiHistory,
      { role: 'user', parts: [{ text }] },
    ]

    const chatUrl = `${getApiBase()}/api/chat-with-expert`

    try {
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scamTitle: scam.title,
          scamExplanation: scam.explanation,
          message: text,
          history: geminiHistory,
        }),
      })

      const rawBody = await res.text()
      let data: { success?: boolean; reply?: string; error?: string }
      try {
        data = rawBody ? JSON.parse(rawBody) : {}
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text:
              'Could not read the server response. Is the backend running on port 4000 and reachable?',
          },
        ])
        return
      }

      const reply =
        data.success && data.reply
          ? data.reply
          : (data.error ??
              (!res.ok ? `Request failed (${res.status}). Try again.` : 'Sorry, I could not get a response. Please try again.'))

      setMessages((prev) => [...prev, { sender: 'ai', text: reply }])
      setGeminiHistory([
        ...outgoingHistory,
        { role: 'model', parts: [{ text: reply }] },
      ])
    } catch (err) {
      const hint =
        import.meta.env.DEV && typeof window !== 'undefined' && window.location.hostname !== 'localhost'
          ? ' Tip: use the Vite dev proxy — keep VITE_API_URL for production only, or open the app at localhost.'
          : ''
      const detail = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Could not reach the DocRisk API (${chatUrl}). ${detail}${hint}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const severityClass =
    scam.severity === 'High'
      ? 'risk-pill risk-pill--high'
      : scam.severity === 'Medium'
        ? 'risk-pill risk-pill--medium'
        : 'risk-pill risk-pill--low'

  return (
    <div
      className="scam-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div className="scam-modal" role="dialog" aria-modal="true" aria-labelledby="scam-modal-title">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="scam-modal__header">
          <div className="scam-modal__header-left">
            <div className="scam-modal__header-icon">
              <MessageCircle size={16} />
            </div>
            <div className="scam-modal__header-info">
              <h2 id="scam-modal-title" className="scam-modal__title">{scam.title}</h2>
              <div className="scam-modal__title-meta">
                <span className="scam-category-badge">{scam.category}</span>
                <span className={severityClass}>{scam.severity}</span>
              </div>
            </div>
          </div>
          <button className="scam-modal__close" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="scam-modal__body">

          {/* Explanation Panel */}
          <div className="scam-modal__explain">
            <p className="scam-modal__section-label">Scam Overview</p>
            <p className="scam-modal__explain-text">{scam.explanation}</p>
          </div>

          {/* Chat Panel */}
          <div className="scam-modal__chat">
            <p className="scam-modal__section-label scam-modal__section-label--chat">
              <Bot size={12} />
              Ask the AI Expert
            </p>

            <div className="scam-modal__messages">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-bubble chat-bubble--${msg.sender}`}>
                  <div className="chat-bubble__avatar">
                    {msg.sender === 'ai' ? <Bot size={13} /> : <User size={13} />}
                  </div>
                  <div className="chat-bubble__text">{msg.text}</div>
                </div>
              ))}

              {loading && (
                <div className="chat-bubble chat-bubble--ai">
                  <div className="chat-bubble__avatar">
                    <Bot size={13} />
                  </div>
                  <div className="chat-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="scam-modal__input-row">
              <input
                ref={inputRef}
                className="scam-modal__input"
                type="text"
                placeholder="Ask about this scam…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                autoComplete="off"
              />
              <button
                className="scam-modal__send"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
