// バックエンド(FastAPI)のレスポンスに対応する型定義

export interface Analysis {
  name?: string;
  role?: string;
  provider?: string;
  summary?: string;
  key_points?: string[];
  stance?: string;
  confidence?: number;
  error?: string;
  raw?: string;
}

export interface ContentionPoint {
  id?: string;
  title?: string;
  description?: string;
  positions?: Record<string, string>;
}

export interface Uncertainty {
  score?: number;
  drivers?: string[];
  recommendation?: string;
  delta?: string;
}

export interface Moderator {
  synthesis?: string;
  consensus?: string[];
  contention_points?: ContentionPoint[];
  uncertainty?: Uncertainty;
  raw?: string;
  error?: string;
}

export type Analyses = Record<string, Analysis>;

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface Research {
  query?: string;
  results?: SearchResult[];
  enabled?: boolean;
}

export interface Round1Response {
  session_id: string;
  topic: string;
  research?: Research;
  analyses: Analyses;
  moderator: Moderator;
  stage: string;
}

export interface DebateResponse {
  revised_summary?: string;
  rebuttal?: string;
  stance?: string;
  confidence?: number;
  name?: string;
  error?: string;
  raw?: string;
}

export interface Round2Response {
  session_id: string;
  round2: {
    point?: ContentionPoint;
    responses?: Record<string, DebateResponse>;
  };
  uncertainty: Uncertainty;
  stage: string;
}

export interface JudgmentResponse {
  session_id: string;
  judgment: Record<string, unknown>;
  stage: string;
}

export interface SessionSummary {
  session_id: string;
  created_at: number;
  topic: string | null;
  stage: string;
  decision: string | null;
}

export interface SessionDetail {
  session_id: string;
  topic: string | null;
  research?: Research;
  analyses: Analyses;
  moderator: Moderator;
  selected_point: ContentionPoint;
  round2: Round2Response["round2"];
  uncertainty: Uncertainty;
  judgment: Record<string, unknown>;
  stage: string;
}
