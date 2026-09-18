import { useEffect, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { LoginForm } from "./components/LoginForm";
import { api } from "./api/client";
import { useAuthStore } from "./state/authStore";

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setCheckingSession(false);
      return;
    }
    if (user) {
      setCheckingSession(false);
      return;
    }
    api
      .me()
      .then((u) => setUser(u as any))
      .catch(() => logout())
      .finally(() => setCheckingSession(false));
  }, [accessToken, user, setUser, logout]);

  if (checkingSession) return <div className="app-loading">Loading…</div>;
  if (!accessToken || !user) return <LoginForm />;

  return (
    <div className="app-shell">
      <ConversationSidebar />
      <main className="app-main">
        <ChatWindow />
      </main>
    </div>
  );
}
