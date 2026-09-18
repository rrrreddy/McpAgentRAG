import { useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useChatStore } from "../state/chatStore";
import { MessageBubble } from "./MessageBubble";

export function ChatWindow() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const isSending = useChatStore((s) => s.isSending);
  const setSending = useChatStore((s) => s.setSending);
  const conversationId = useChatStore((s) => s.conversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isSending) return;

    setError(null);
    setInput("");
    addMessage({ id: crypto.randomUUID(), role: "user", content: question });
    setSending(true);

    try {
      const response = await api.sendMessage(question, conversationId);
      setConversationId(response.conversation_id);
      addMessage({
        id: response.message_id,
        role: "assistant",
        content: response.answer,
        route: response.route,
        citations: response.citations,
        confidence: response.confidence,
        tableData: response.table_data ?? undefined,
        chartSpec: response.chart_spec ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please retry.");
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <h2>Ask about policy, DataHub metrics, or Informatica lineage</h2>
            <ul>
              <li>"What is our data access policy for customer PII?"</li>
              <li>"What was total_deposits for 2026-06?"</li>
              <li>"Plot the delinquency rate trend"</li>
              <li>"Where does account_balance come from in M_LOAD_ACCOUNTS?"</li>
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isSending && (
          <div className="message-row message-row--assistant">
            <div className="message-bubble message-bubble--typing">Thinking…</div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      {error && <div className="chat-error">{error}</div>}
      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          disabled={isSending}
          maxLength={4000}
        />
        <button type="submit" disabled={isSending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
