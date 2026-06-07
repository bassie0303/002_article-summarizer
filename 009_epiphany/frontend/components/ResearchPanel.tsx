import type { Research } from "@/lib/types";

export default function ResearchPanel({
  research,
  loading = false,
}: {
  research?: Research;
  loading?: boolean;
}) {
  const results = research?.results ?? [];

  // 検索待ち（ストリーミングで research イベント到着前）
  if (!research && loading) {
    return (
      <section>
        <div className="section-title">RESEARCH — 根拠収集（Web検索）</div>
        <div className="panel">
          <div className="summary thinking">
            ◆ Web検索で根拠を収集中<span className="cursor">_</span>
          </div>
        </div>
      </section>
    );
  }

  if (!research) return null;

  return (
    <section>
      <div className="section-title">RESEARCH — 根拠収集（Web検索）</div>
      <div className="panel">
        {results.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            （有効な検索結果が得られませんでした。賢者は一般知識で分析します）
          </div>
        ) : (
          <ol className="sources">
            {results.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title || r.url}
                </a>
                {r.snippet && <p>{r.snippet}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
