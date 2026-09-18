import { useAuthStore } from "../state/authStore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export interface Citation {
  source_type: string;
  title: string;
  reference: string;
  excerpt?: string | null;
}

export interface ChatResponse {
  conversation_id: string;
  message_id: string;
  route: string;
  answer: string;
  citations: Citation[];
  confidence: number;
  table_data?: { columns: string[]; rows: Record<string, unknown>[] } | null;
  chart_spec?: Record<string, unknown> | null;
  correlation_id: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    throw new ApiError(401, "No refresh token available");
  }
  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    logout();
    throw new ApiError(response.status, "Session expired, please log in again");
  }
  const data = await response.json();
  setTokens(data.access_token, data.refresh_token);
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && retry && useAuthStore.getState().refreshToken) {
    // Coalesce concurrent 401s into a single refresh call.
    refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => (refreshPromise = null));
    await refreshPromise;
    return request<T>(path, options, false);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new ApiError(429, `Rate limited — retry after ${retryAfter ?? "a few"} seconds.`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, body.detail || "Request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  async login(email: string, password: string) {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const response = await fetch(`${API_BASE_URL}/api/auth/token`, { method: "POST", body: form });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: "Login failed" }));
      throw new ApiError(response.status, body.detail || "Login failed");
    }
    return response.json() as Promise<{ access_token: string; refresh_token: string }>;
  },

  async register(email: string, password: string, displayName: string) {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
  },

  async me() {
    return request("/api/auth/me");
  },

  async logout(refreshToken: string) {
    return fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined);
  },

  async sendMessage(question: string, conversationId: string | null) {
    return request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question, conversation_id: conversationId }),
    });
  },

  async listConversations() {
    return request<ConversationSummary[]>("/api/chat/conversations");
  },

  async getMessages(conversationId: string) {
    return request(`/api/chat/conversations/${conversationId}/messages`);
  },
};

export { ApiError };
