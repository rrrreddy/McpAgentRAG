import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartSpec {
  type: "stat" | "bar" | "line";
  label?: string;
  value?: number;
  unit?: string;
  period?: string;
  color?: string;
  x_field?: string;
  y_field?: string;
  y_label?: string;
  data?: Record<string, unknown>[];
  series_color?: string;
  delta?: number | null;
  pct_change?: number | null;
  delta_color?: string;
  title?: string;
}

function formatValue(value: number, unit?: string): string {
  if (unit === "USD") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === "percent") return `${value.toFixed(2)}%`;
  return value.toLocaleString();
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  if (spec.type === "stat" && spec.value !== undefined) {
    return (
      <div className="stat-tile">
        <div className="stat-tile__label">{spec.label}</div>
        <div className="stat-tile__value" style={{ color: spec.color }}>
          {formatValue(spec.value, spec.unit)}
        </div>
        <div className="stat-tile__period">{spec.period}</div>
      </div>
    );
  }

  if (spec.type === "bar" && spec.data) {
    return (
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spec.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey={spec.x_field} stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
            <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => formatValue(Number(value), spec.y_label)}
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Bar dataKey={spec.y_field ?? "value"} fill={spec.series_color ?? "#2a78d6"} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {spec.delta !== null && spec.delta !== undefined && (
          <div className="chart-delta" style={{ color: spec.delta_color }}>
            {spec.delta >= 0 ? "▲" : "▼"} {formatValue(Math.abs(spec.delta), spec.y_label)}
            {spec.pct_change != null && ` (${spec.pct_change >= 0 ? "+" : ""}${spec.pct_change.toFixed(1)}%)`}
          </div>
        )}
      </div>
    );
  }

  if (spec.type === "line" && spec.data) {
    return (
      <div className="chart-card">
        {spec.title && <div className="chart-card__title">{spec.title}</div>}
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={spec.data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
            <XAxis dataKey={spec.x_field} stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
            <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value) => formatValue(Number(value), spec.y_label)}
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Line
              type="monotone"
              dataKey={spec.y_field ?? "value"}
              stroke={spec.series_color ?? "#2a78d6"}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
