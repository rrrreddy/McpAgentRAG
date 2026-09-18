import { ChartRenderer } from "./ChartRenderer";
import { CitationList } from "./CitationList";
import { DataTable } from "./DataTable";
import type { ChatMessage } from "../state/chatStore";

const ROUTE_LABELS: Record<string, string> = {
  knowledge: "Knowledge (SharePoint)",
  data: "Data (DataHub)",
  lineage: "Lineage (Informatica)",
  denied: "Access denied",
  clarify: "Needs clarification",
};

function confidenceLabel(confidence?: number): { label: string; className: string } {
  if (confidence === undefined) return { label: "", className: "" };
  if (confidence >= 0.7) return { label: "High confidence", className: "confidence--high" };
  if (confidence >= 0.4) return { label: "Medium confidence", className: "confidence--medium" };
  return { label: "Low confidence", className: "confidence--low" };
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const confidence = confidenceLabel(message.confidence);

  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}>
      <div className="message-bubble">
        {!isUser && message.route && (
          <div className="message-meta">
            <span className="route-badge">{ROUTE_LABELS[message.route] ?? message.route}</span>
            {message.confidence !== undefined && <span className={`confidence-badge ${confidence.className}`}>{confidence.label}</span>}
          </div>
        )}
        <div className="message-content">{message.content}</div>
        {message.chartSpec && <ChartRenderer spec={message.chartSpec as any} />}
        {message.tableData && <DataTable table={message.tableData as any} />}
        {message.citations && <CitationList citations={message.citations} />}
      </div>
    </div>
  );
}
