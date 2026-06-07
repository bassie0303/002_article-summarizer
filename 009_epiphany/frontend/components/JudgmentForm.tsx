"use client";

import { useState } from "react";

const DECISIONS = ["承認", "却下", "保留", "条件付き承認"];

export default function JudgmentForm({
  onSubmit,
  busy,
}: {
  onSubmit: (decision: string, rationale: string) => void;
  busy: boolean;
}) {
  const [decision, setDecision] = useState(DECISIONS[0]);
  const [rationale, setRationale] = useState("");

  return (
    <section>
      <div className="section-title">FINAL JUDGMENT — 議長の最終判断</div>
      <div className="panel">
        <label style={{ fontSize: 12, color: "var(--dim)" }}>決定</label>
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          style={{ margin: "6px 0 14px" }}
        >
          <option value="承認">承認（GO）</option>
          <option value="却下">却下（NO GO）</option>
          <option value="保留">保留（要追加調査）</option>
          <option value="条件付き承認">条件付き承認</option>
        </select>
        <label style={{ fontSize: 12, color: "var(--dim)" }}>理由・コメント</label>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="判断の根拠を記録…"
        />
        <button
          style={{ marginTop: 14 }}
          disabled={busy}
          onClick={() => onSubmit(decision, rationale)}
        >
          最終判断を記録
        </button>
      </div>
    </section>
  );
}
