"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "@/lib/api";
import type { SessionDetail } from "@/lib/types";
import ResearchPanel from "@/components/ResearchPanel";
import SageCard from "@/components/SageCard";
import ModeratorPanel from "@/components/ModeratorPanel";
import Round2Panel from "@/components/Round2Panel";

const SAGE_IDS = ["melchior", "balthasar", "casper"];

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getSession(id)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) {
    return (
      <section>
        <Link href="/history" className="back-link">
          ← 履歴一覧へ
        </Link>
        <div className="err" style={{ marginTop: 12 }}>
          ⚠ {error}
        </div>
      </section>
    );
  }

  if (!detail) {
    return <div className="loading">◆ 読み込み中…</div>;
  }

  const hasRound2 =
    !!detail.round2 &&
    Object.keys(detail.round2.responses ?? {}).length > 0;
  const decision = (detail.judgment?.decision as string) ?? null;
  const rationale = (detail.judgment?.rationale as string) ?? null;

  return (
    <>
      <Link href="/history" className="back-link">
        ← 履歴一覧へ
      </Link>

      <div className="section-title" style={{ marginTop: 14 }}>
        議題
      </div>
      <div className="panel" style={{ fontSize: 15, color: "#dbe7f2" }}>
        {detail.topic ?? "（無題）"}
      </div>

      {detail.research && <ResearchPanel research={detail.research} />}

      <section>
        <div className="section-title">ROUND 1 — 独立分析</div>
        <div className="grid">
          {SAGE_IDS.map((sid) => (
            <SageCard key={sid} id={sid} analysis={detail.analyses[sid]} />
          ))}
        </div>
      </section>

      <ModeratorPanel
        moderator={detail.moderator}
        selectedId={detail.selected_point?.id ?? null}
        onSelect={() => {}}
        onRound2={() => {}}
        busy={false}
        readOnly
      />

      {hasRound2 && (
        <Round2Panel
          data={{
            session_id: detail.session_id,
            round2: detail.round2,
            uncertainty: detail.uncertainty,
            stage: detail.stage,
          }}
        />
      )}

      {decision && (
        <section>
          <div className="section-title">FINAL JUDGMENT — 議長の最終判断</div>
          <div className="panel">
            <div style={{ fontSize: 15, color: "#4ade80", marginBottom: 8 }}>
              <span className="glow-dot" />
              決定: {decision}
            </div>
            {rationale && (
              <div style={{ fontSize: 13, color: "#9fb0c0", lineHeight: 1.7 }}>
                理由: {rationale}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
