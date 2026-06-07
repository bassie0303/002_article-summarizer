import type { Round2Response } from "@/lib/types";
import UncertaintyGauge from "./UncertaintyGauge";

const COLORS: Record<string, string> = {
  melchior: "var(--melchior)",
  balthasar: "var(--balthasar)",
  casper: "var(--casper)",
};
const SAGE_IDS = ["melchior", "balthasar", "casper"];

export default function Round2Panel({ data }: { data: Round2Response }) {
  const responses = data.round2.responses ?? {};
  const unc = data.uncertainty ?? {};
  return (
    <section>
      <div className="section-title">ROUND 2 — 再討論</div>
      <div className="grid">
        {SAGE_IDS.map((id) => {
          const r = responses[id] ?? {};
          const conf = Math.round((r.confidence ?? 0) * 100);
          return (
            <div
              key={id}
              className="sage"
              style={{ ["--c" as string]: COLORS[id] }}
            >
              <h2>{r.name ?? id.toUpperCase()}</h2>
              <div className="summary">
                {r.revised_summary ?? r.raw ?? "（応答なし）"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#9fb0c0",
                  borderTop: "1px dashed var(--line)",
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <b style={{ color: "#cfe6ff" }}>反論:</b> {r.rebuttal ?? "—"}
              </div>
              <div className="meta">
                <span className="stance">立場: {r.stance ?? "—"}</span>
                <span>確信度 {conf}%</span>
              </div>
              <div className="bar">
                <div style={{ width: `${conf}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <UncertaintyGauge label="再評価後の不確実性" score={unc.score} />
        {(unc.recommendation || unc.delta) && (
          <div style={{ fontSize: 13, color: "#cfe6ff", marginTop: 6 }}>
            {unc.recommendation ? `助言: ${unc.recommendation}` : ""}
            {unc.delta ? `（${unc.delta}）` : ""}
          </div>
        )}
      </div>
    </section>
  );
}
