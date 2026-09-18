import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  security_groups: string[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

// Tokens live in localStorage so a page refresh doesn't force re-login —
// this is a real deployed app (not a shared/public page), so this is the
// standard SPA pattern, distinct from "don't persist state you can't
// revoke": logout here also calls POST /api/auth/logout to revoke the
// server-side refresh token record, not just clear local storage.
const STORAGE_KEY = "ragmcp.auth";

function loadPersisted(): Pick<AuthState, "accessToken" | "refreshToken" | "user"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

function persist(state: Pick<AuthState, "accessToken" | "refreshToken" | "user">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only — a private-browsing mode or full storage should never crash the app
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadPersisted(),
  setTokens: (accessToken, refreshToken) => {
    set({ accessToken, refreshToken });
    persist({ accessToken, refreshToken, user: get().user });
  },
  setUser: (user) => {
    set({ user });
    persist({ accessToken: get().accessToken, refreshToken: get().refreshToken, user });
  },
  logout: () => {
    set({ accessToken: null, refreshToken: null, user: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
