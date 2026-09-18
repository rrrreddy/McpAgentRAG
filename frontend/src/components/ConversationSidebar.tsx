import { useEffect } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";

export function ConversationSidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const setConversations = useChatStore((s) => s.setConversations);
  const conversationId = useChatStore((s) => s.conversationId);
  const setConversationId = useChatStore((s) => s.setConversationId);
  const setMessages = useChatStore((s) => s.setMessages);
  const reset = useChatStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);

  useEffect(() => {
    api.listConversations().then(setConversations).catch(() => undefined);
  }, [setConversations]);

  async function openConversation(id: string) {
    setConversationId(id);
    const messages = (await api.getMessages(id)) as any[];
    setMessages(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        route: m.route,
        citations: m.citations,
        confidence: m.confidence,
        tableData: m.table_data,
        chartSpec: m.chart_spec,
      }))
    );
  }

  async function handleLogout() {
    if (refreshToken) await api.logout(refreshToken);
    logout();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <button className="new-chat-button" onClick={reset}>
          + New conversation
        </button>
      </div>
      <div className="sidebar__conversations">
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`conversation-item ${c.id === conversationId ? "conversation-item--active" : ""}`}
            onClick={() => openConversation(c.id)}
          >
            {c.title || "Untitled"}
          </button>
        ))}
      </div>
      <div className="sidebar__footer">
        <div className="user-info">
          <div className="user-info__name">{user?.display_name}</div>
          <div className="user-info__role">{user?.role}</div>
        </div>
        <button className="logout-button" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
