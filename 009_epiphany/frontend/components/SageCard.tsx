import type { Analysis } from "@/lib/types";

const COLORS: Record<string, string> = {
  melchior: "var(--melchior)",
  balthasar: "var(--balthasar)",
  casper: "var(--casper)",
};

const FALLBACK_NAMES: Record<string, string> = {
  melchior: "MELCHIOR-1",
  balthasar: "BALTHASAR-2",
  casper: "CASPER-3",
};

const FALLBACK_ROLES: Record<string, string> = {
  melchior: "データ・統計分析の賢者",
  balthasar: "リスク・倫理評価の賢者",
  casper: "創造・提案の賢者",
};

export default function SageCard({
  id,
  analysis,
  loading = false,
}: {
  id: string;
  analysis?: Analysis;
  loading?: boolean;
}) {
  const a = analysis ?? {};
  const conf = Math.round((a.confidence ?? 0) * 100);

  // まだ結果が来ていない（ストリーミング待ち）状態
  if (!analysis && loading) {
    return (
      <div className="sage pending" style={{ ["--c" as string]: COLORS[id] }}>
        <h2>{FALLBACK_NAMES[id] ?? id.toUpperCase()}</h2>
        <div className="role">{FALLBACK_ROLES[id] ?? ""}</div>
        <div className="summary thinking">
          ◆ 思索中<span className="cursor">_</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sage" style={{ ["--c" as string]: COLORS[id] }}>
      {a.provider && <span className="provider">{a.provider}</span>}
      <h2>{a.name ?? FALLBACK_NAMES[id] ?? id.toUpperCase()}</h2>
      <div className="role">{a.role ?? FALLBACK_ROLES[id] ?? ""}</div>
      <div className="summary">{a.summary ?? a.raw ?? "（応答なし）"}</div>
      <ul>
        {(a.key_points ?? []).map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <div className="meta">
        <span className="stance">立場: {a.stance ?? "—"}</span>
        <span>確信度 {conf}%</span>
      </div>
      <div className="bar">
        <div style={{ width: `${conf}%` }} />
      </div>
    </div>
  );
}
