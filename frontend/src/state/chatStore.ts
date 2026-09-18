import { create } from "zustand";
import type { ChatResponse, ConversationSummary } from "../api/client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: string;
  citations?: ChatResponse["citations"];
  confidence?: number;
  tableData?: ChatResponse["table_data"];
  chartSpec?: ChatResponse["chart_spec"];
}

interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  conversations: ConversationSummary[];
  isSending: boolean;
  setConversationId: (id: string | null) => void;
  setConversations: (conversations: ConversationSummary[]) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setSending: (sending: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversationId: null,
  messages: [],
  conversations: [],
  isSending: false,
  setConversationId: (id) => set({ conversationId: id }),
  setConversations: (conversations) => set({ conversations }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setSending: (isSending) => set({ isSending }),
  reset: () => set({ conversationId: null, messages: [] }),
}));
