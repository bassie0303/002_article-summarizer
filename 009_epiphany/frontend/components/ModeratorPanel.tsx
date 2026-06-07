import type { ContentionPoint, Moderator } from "@/lib/types";
import UncertaintyGauge from "./UncertaintyGauge";

export default function ModeratorPanel({
  moderator,
  selectedId,
  onSelect,
  onRound2,
  busy,
  loading = false,
  readOnly = false,
}: {
  moderator: Moderator;
  selectedId: string | null;
  onSelect: (point: ContentionPoint) => void;
  onRound2: () => void;
  busy: boolean;
  loading?: boolean;
  readOnly?: boolean;
}) {
  const points = moderator.contention_points ?? [];
  const drivers = moderator.uncertainty?.drivers ?? [];
  const hasContent =
    !!moderator.synthesis || !!moderator.raw || points.length > 0;

  // 3賢者は出揃ったが統合がまだ来ていない（ストリーミング待ち）
  if (!hasContent) {
    if (!loading) return null;
    return (
      <section>
        <div className="section-title">MODERATOR — 統合・争点抽出</div>
        <div className="panel">
          <div className="summary thinking">
            ◆ 三博士の見解を統合中<span className="cursor">_</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-title">MODERATOR — 統合・争点抽出</div>
      <div className="panel">
        <div className="summary" style={{ fontSize: 14, lineHeight: 1.8 }}>
          {moderator.synthesis ?? moderator.raw ?? ""}
        </div>
        <UncertaintyGauge label="不確実性" score={moderator.uncertainty?.score} />
        {drivers.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            要因: {drivers.join(" / ")}
          </div>
        )}
        <div
          style={{
            marginTop: 16,
            color: "#9fb4c8",
            letterSpacing: 2,
            fontSize: 13,
          }}
        >
          {readOnly
            ? "▼ 争点（選択済みはハイライト）"
            : "▼ 再討論する争点を1つ選択してください"}
        </div>
        <div className="points">
          {points.map((p, i) => {
            const id = p.id ?? String(i);
            const isSelected = selectedId === id;
            return (
              <div
                key={id}
                className={`point${isSelected ? " selected" : ""}`}
                onClick={readOnly ? undefined : () => onSelect({ ...p, id })}
                style={readOnly ? { cursor: "default" } : undefined}
              >
                <h3>
                  争点 {i + 1}: {p.title ?? ""}
                  {readOnly && isSelected && (
                    <span style={{ color: "#ffcf5c", marginLeft: 8 }}>
                      ◀ 選択
                    </span>
                  )}
                </h3>
                <p>{p.description ?? ""}</p>
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <button
            style={{ marginTop: 16 }}
            disabled={!selectedId || busy}
            onClick={onRound2}
          >
            選択した争点で再討論
          </button>
        )}
      </div>
    </section>
  );
}
