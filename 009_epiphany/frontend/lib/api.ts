import type {
  Analysis,
  ContentionPoint,
  JudgmentResponse,
  Moderator,
  Research,
  Round1Response,
  Round2Response,
  SessionDetail,
  SessionSummary,
} from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(e.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const listSessions = () =>
  get<{ sessions: SessionSummary[] }>("/api/sessions");

export const getSession = (id: string) =>
  get<SessionDetail>(`/api/session/${id}`);

// API のベースURL。
//  - 空("") の場合は同一オリジン → next.config.ts の rewrites で :8000 にプロキシ。
//    ただし dev プロキシは ~30秒で socket hang up するため、LLM応答(>30s)では切れる。
//  - NEXT_PUBLIC_API_BASE を設定するとブラウザが直接バックエンドを叩く（CORSで許可済み）。
//    長時間のLLM呼び出しでもタイムアウトしないので dev ではこちらを使う。
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(e.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const round1 = (topic: string) =>
  post<Round1Response>("/api/round1", { topic });

export const round2 = (sessionId: string, selectedPoint: ContentionPoint) =>
  post<Round2Response>("/api/round2", {
    session_id: sessionId,
    selected_point: selectedPoint,
  });

export const judgment = (
  sessionId: string,
  decision: string,
  rationale: string,
) =>
  post<JudgmentResponse>("/api/judgment", {
    session_id: sessionId,
    judgment: { decision, rationale },
  });

// ---------------------------------------------------------------------------
// Round1 の SSE ストリーミング
//   各賢者が完了するたびに onAnalysis が、統合完了で onModerator が呼ばれる。
//   EventSource は GET 専用なので fetch + ReadableStream で SSE を自前パースする。
//   ストリーミングはプロキシでバッファされやすいため必ず BASE(直結)を使う。
// ---------------------------------------------------------------------------

export interface Round1StreamHandlers {
  onSession?: (d: { session_id: string; topic: string }) => void;
  onResearch?: (d: { research: Research }) => void;
  onAnalysis?: (d: { id: string; analysis: Analysis }) => void;
  onModerator?: (d: { moderator: Moderator }) => void;
  onDone?: (d: { session_id: string; stage: string }) => void;
  onError?: (detail: string) => void;
}

export async function round1Stream(
  topic: string,
  handlers: Round1StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(BASE + "/api/round1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
    signal,
  });
  if (!res.ok || !res.body) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(e.detail || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, dataStr: string) => {
    if (!dataStr) return;
    const data = JSON.parse(dataStr);
    switch (event) {
      case "session":
        handlers.onSession?.(data);
        break;
      case "research":
        handlers.onResearch?.(data);
        break;
      case "analysis":
        handlers.onAnalysis?.(data);
        break;
      case "moderator":
        handlers.onModerator?.(data);
        break;
      case "done":
        handlers.onDone?.(data);
        break;
      case "error":
        handlers.onError?.(data.detail ?? "不明なエラー");
        break;
    }
  };

  // SSE フレームは "\n\n" 区切り。1フレーム内に event:/data: 行が並ぶ。
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      let dataStr = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      dispatch(event, dataStr);
    }
  }
}
