"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSessions } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = {
  running: "分析中",
  select_point: "争点選択待ち",
  judgment: "判断待ち",
  done: "完了",
};

function fmt(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <section>
      <div className="section-title">SESSION HISTORY — 審議履歴</div>

      {error && <div className="err">⚠ {error}</div>}
      {!sessions && !error && <div className="loading">◆ 読み込み中…</div>}

      {sessions && sessions.length === 0 && (
        <div className="empty">
          まだ審議履歴がありません。
          <Link href="/" className="back-link" style={{ marginLeft: 8 }}>
            ＋ 新しい審議を始める
          </Link>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="session-list">
          {sessions.map((s) => (
            <Link
              key={s.session_id}
              href={`/history/${s.session_id}`}
              className="session-row"
            >
              <span className={`badge ${s.stage}`}>
                {STAGE_LABEL[s.stage] ?? s.stage}
                {s.decision ? `・${s.decision}` : ""}
              </span>
              <span className="topic">{s.topic ?? "（無題）"}</span>
              <span className="when">{fmt(s.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
