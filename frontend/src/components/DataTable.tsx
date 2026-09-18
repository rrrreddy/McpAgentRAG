interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function DataTable({ table }: { table: TableData }) {
  if (!table.rows.length) return null;
  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {table.columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {table.columns.map((col) => (
                <td key={col}>{String(row[col] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
