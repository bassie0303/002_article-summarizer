"use client";

import { useState } from "react";
import { judgment, round1Stream, round2 } from "@/lib/api";
import type {
  ContentionPoint,
  Round1Response,
  Round2Response,
} from "@/lib/types";
import TopicBar from "@/components/TopicBar";
import ResearchPanel from "@/components/ResearchPanel";
import SageCard from "@/components/SageCard";
import ModeratorPanel from "@/components/ModeratorPanel";
import Round2Panel from "@/components/Round2Panel";
import JudgmentForm from "@/components/JudgmentForm";

const SAGE_IDS = ["melchior", "balthasar", "casper"];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [r1, setR1] = useState<Round1Response | null>(null);
  const [selected, setSelected] = useState<ContentionPoint | null>(null);
  const [r2, setR2] = useState<Round2Response | null>(null);
  const [recorded, setRecorded] = useState<{
    decision: string;
    rationale: string;
  } | null>(null);

  async function run<T>(statusMsg: string, fn: () => Promise<T>): Promise<T | undefined> {
    setError("");
    setBusy(true);
    setStatus(statusMsg);
    try {
      const res = await fn();
      setStatus("");
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function runRound1() {
    if (!topic.trim()) {
      setError("議題を入力してください");
      return;
    }
    setError("");
    setSelected(null);
    setR2(null);
    setRecorded(null);
    setBusy(true);
    setStatus("◆ Web検索で根拠を収集中…");
    // 空の r1 を即座に置き、3枚の「思索中」カードを表示する
    setR1({ session_id: "", topic, analyses: {}, moderator: {}, stage: "running" });

    try {
      await round1Stream(topic, {
        onSession: (d) =>
          setR1((p) => (p ? { ...p, session_id: d.session_id } : p)),
        onResearch: (d) => {
          setStatus("◆ 三博士を召喚中…");
          setR1((p) => (p ? { ...p, research: d.research } : p));
        },
        onAnalysis: (d) => {
          setStatus("◆ 賢者の見解が届いています…");
          setR1((p) =>
            p ? { ...p, analyses: { ...p.analyses, [d.id]: d.analysis } } : p,
          );
        },
        onModerator: (d) => {
          setStatus("◆ 統合中…");
          setR1((p) => (p ? { ...p, moderator: d.moderator } : p));
        },
        onDone: (d) => {
          setR1((p) => (p ? { ...p, stage: d.stage } : p));
          setStatus("");
        },
        onError: (detail) => setError(detail),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  async function runRound2() {
    if (!selected || !r1) return;
    setR2(null);
    setRecorded(null);
    const res = await run("◆ 選択された争点で再討論中…", () =>
      round2(r1.session_id, selected),
    );
    if (res) setR2(res);
  }

  async function runJudgment(decision: string, rationale: string) {
    if (!r1) return;
    const res = await run("◆ 最終判断を記録中…", () =>
      judgment(r1.session_id, decision, rationale),
    );
    if (res) setRecorded({ decision, rationale });
  }

  // Round1 がストリーミング中か（done で stage が select_point になるまで）
  const r1Streaming = !!r1 && r1.stage === "running";

  return (
    <>
      <TopicBar topic={topic} setTopic={setTopic} onRun={runRound1} busy={busy} />

      {status && <div className="loading">{status}</div>}
      {error && <div className="err">⚠ {error}</div>}

      {r1 && <ResearchPanel research={r1.research} loading={r1Streaming} />}

      {r1 && (
        <section>
          <div className="section-title">ROUND 1 — 独立分析</div>
          <div className="grid">
            {SAGE_IDS.map((id) => (
              <SageCard
                key={id}
                id={id}
                analysis={r1.analyses[id]}
                loading={r1Streaming}
              />
            ))}
          </div>
        </section>
      )}

      {r1 && (
        <ModeratorPanel
          moderator={r1.moderator}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onRound2={runRound2}
          busy={busy}
          loading={r1Streaming}
        />
      )}

      {r2 && <Round2Panel data={r2} />}

      {r2 && !recorded && <JudgmentForm onSubmit={runJudgment} busy={busy} />}

      {recorded && (
        <section>
          <div className="section-title">RECORDED</div>
          <div className="panel">
            <span className="glow-dot" />
            <span>
              判断「{recorded.decision}」を記録しました。session=
              {r1?.session_id}
            </span>
          </div>
        </section>
      )}
    </>
  );
}
