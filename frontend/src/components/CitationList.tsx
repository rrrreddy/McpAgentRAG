import type { Citation } from "../api/client";

const SOURCE_LABELS: Record<string, string> = {
  sharepoint: "SharePoint",
  datahub: "DataHub",
  informatica_lineage: "Informatica Lineage",
};

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="citation-list">
      <div className="citation-list__label">Sources</div>
      <ul>
        {citations.map((c, i) => (
          <li key={i} className="citation-item">
            <span className={`citation-badge citation-badge--${c.source_type}`}>{SOURCE_LABELS[c.source_type] ?? c.source_type}</span>
            {c.reference.startsWith("http") ? (
              <a href={c.reference} target="_blank" rel="noreferrer">
                {c.title}
              </a>
            ) : (
              <span>{c.title || c.reference}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
