"""Epiphany — LangGraph StateGraph（コアロジック）

東方の三博士をモチーフにした 3AI 相互査読フロー。

[START]
  → parallel_analysis     # MELCHIOR/BALTHASAR/CASPER を asyncio.gather で並列実行
  → moderator             # 統合・争点抽出・不確実性スコア
  → gate_select_point     # interrupt: ユーザーが争点を選ぶまで一時停止
  → round2_debate         # 選択争点で再討論（resume）
  → uncertainty_update    # 不確実性スコア再計算
  → gate_judgment         # interrupt: 人間の最終判断を待つ
  → record_judgment       # 最終判断記録
[END]
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Annotated, Any, Optional, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

# 静的割り込み：これらのノードの「直前」でグラフを一時停止する。
# 動的 interrupt() は config contextvar を要し Python 3.11+ 依存になるため、
# 3.9 でも確実に動く静的割り込み + update_state 方式を採用する。
#   - round2_debate の直前で停止 → ユーザーが争点を選び selected_point を注入して再開
#   - record_judgment の直前で停止 → 議長が judgment を注入して再開
INTERRUPT_BEFORE = ["round2_debate", "record_judgment"]

# ---------------------------------------------------------------------------
# プロバイダ設定 — キーが無いプロバイダは自動で Claude にフォールバックする
# ---------------------------------------------------------------------------

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# 出力トークン上限。モデレーターは synthesis + 争点 + positions + 不確実性 を
# まとめて JSON で返すため大きめに取る（小さいと途中で切れて JSON が壊れる）。
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))

_HAS_ANTHROPIC = bool(os.getenv("ANTHROPIC_API_KEY"))
_HAS_OPENAI = bool(os.getenv("OPENAI_API_KEY"))
_HAS_GEMINI = bool(os.getenv("GEMINI_API_KEY"))


def resolve_provider(preferred: str) -> str:
    """希望プロバイダのキーが無ければ anthropic にフォールバック。"""
    if preferred == "openai" and _HAS_OPENAI:
        return "openai"
    if preferred == "gemini" and _HAS_GEMINI:
        return "gemini"
    return "anthropic"


# 三博士 + モデレーターのペルソナ定義
#   id / 希望プロバイダ / 役割を表すシステムプロンプト
PERSONAS: dict[str, dict[str, str]] = {
    "melchior": {
        "name": "MELCHIOR-1",
        "preferred": "openai",
        "role": "データ・統計分析の賢者",
        "system": (
            "あなたは MELCHIOR-1。データと統計に基づく定量分析を担う賢者です。"
            "事実・数値・トレンド・根拠を重視し、感情を排して冷徹に分析します。"
        ),
    },
    "balthasar": {
        "name": "BALTHASAR-2",
        "preferred": "anthropic",
        "role": "リスク・倫理評価の賢者",
        "system": (
            "あなたは BALTHASAR-2。リスクと倫理を司る賢者です。"
            "潜在的な危険・副作用・倫理的問題・ステークホルダーへの影響を慎重に評価します。"
        ),
    },
    "casper": {
        "name": "CASPER-3",
        "preferred": "gemini",
        "role": "創造・提案の賢者",
        "system": (
            "あなたは CASPER-3。創造性と発想を司る賢者です。"
            "既成概念にとらわれず、新しい選択肢・代替案・機会を大胆に提案します。"
        ),
    },
}


# ---------------------------------------------------------------------------
# LLM 呼び出しの薄いラッパー（async 統一）
# ---------------------------------------------------------------------------


class LLMError(Exception):
    """LLM 呼び出し失敗。1ノードの失敗が全体を巻き込まないよう個別に捕捉する。"""


async def call_llm(system: str, user: str, preferred: str) -> str:
    """システム/ユーザープロンプトを与えてテキスト応答を返す。

    呼び出しに失敗した場合は LLMError を送出する（呼び出し側で握りつぶす）。
    """
    provider = resolve_provider(preferred)
    try:
        if provider == "openai":
            return await _call_openai(system, user)
        if provider == "gemini":
            return await _call_gemini(system, user)
        return await _call_anthropic(system, user)
    except Exception as exc:  # noqa: BLE001 — プロバイダ横断で一様に扱う
        raise LLMError(f"{provider}: {exc}") from exc


async def _call_anthropic(system: str, user: str) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic()
    resp = await client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")


async def _call_openai(system: str, user: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI()
    resp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


async def _call_gemini(system: str, user: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel(GEMINI_MODEL, system_instruction=system)
    # google-generativeai は同期APIなのでスレッドに逃がす
    resp = await asyncio.to_thread(
        model.generate_content,
        user,
        generation_config={"max_output_tokens": MAX_TOKENS},
    )
    return resp.text or ""


# ---------------------------------------------------------------------------
# Web 検索ツール（LangGraph の research ノードから利用）
#   キー不要の DuckDuckGo を既定にし、TAVILY_API_KEY があれば Tavily を使う。
#   失敗時は空リストを返し、賢者は根拠なしで通常分析に degrade する。
# ---------------------------------------------------------------------------

WEB_SEARCH_ENABLED = os.getenv("ENABLE_WEB_SEARCH", "true").lower() in (
    "1",
    "true",
    "yes",
)
WEB_SEARCH_MAX = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "5"))


# 広告・リダイレクト系 URL（検索エンジンのスポンサー枠）。根拠にならないので除外する。
_AD_URL_MARKERS = ("/aclick", "/aclk", "duckduckgo.com/y.js", "bing.com/aclick", "/aclick?")


def _is_ad_url(url: str) -> bool:
    return (not url) or any(m in url for m in _AD_URL_MARKERS)


async def web_search(query: str, max_results: int = WEB_SEARCH_MAX) -> list[dict[str, str]]:
    """Web 検索を行い [{title, snippet, url}] を返す（失敗時は空リスト）。

    広告/リダイレクト枠を除外し、重複 URL を畳んだうえで max_results 件に絞る。
    """

    def _ddg() -> list[dict[str, Any]]:
        from ddgs import DDGS

        with DDGS() as d:
            # 広告除外で件数が減るぶん、多めに取得してから絞る
            return list(d.text(query, region="jp-jp", max_results=max_results * 2 + 4))

    try:
        raw = await asyncio.to_thread(_ddg)
    except Exception as exc:  # noqa: BLE001 — 検索失敗は致命的でない
        print(f"[epiphany] web_search 失敗: {exc}")
        return []

    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for r in raw:
        url = (r.get("href") or "").strip()
        if _is_ad_url(url) or url in seen:
            continue
        seen.add(url)
        results.append(
            {
                "title": (r.get("title") or "").strip(),
                "snippet": (r.get("body") or "").strip(),
                "url": url,
            }
        )
        if len(results) >= max_results:
            break
    return results


def _format_evidence(research: Optional[dict[str, Any]]) -> str:
    """research 結果をプロンプト注入用の番号付き箇条書きに整形する。"""
    results = (research or {}).get("results") or []
    if not results:
        return ""
    lines = []
    for i, r in enumerate(results, 1):
        snippet = (r.get("snippet") or "").replace("\n", " ").strip()
        if len(snippet) > 200:
            snippet = snippet[:200] + "…"
        lines.append(f"[{i}] {r.get('title', '')} — {snippet}（出典: {r.get('url', '')}）")
    return "\n".join(lines)


def safe_json(text: str) -> dict[str, Any]:
    """モデル出力から JSON を頑健に抽出する。

    コードフェンスや前後の地の文が混ざっても最初の JSON オブジェクトを拾う。
    失敗時は raw テキストを包んで返す。
    """
    if not text:
        return {}
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {"raw": text.strip()}


# ---------------------------------------------------------------------------
# State 定義
# ---------------------------------------------------------------------------


def _merge(left: dict, right: dict) -> dict:
    return {**(left or {}), **(right or {})}


class EpiphanyState(TypedDict, total=False):
    topic: str
    research: dict[str, Any]                       # Web検索で集めた根拠
    analyses: Annotated[dict[str, Any], _merge]  # persona_id -> 分析結果
    moderator: dict[str, Any]                     # 統合・争点・不確実性
    selected_point: dict[str, Any]                # 選ばれた争点
    round2: dict[str, Any]                        # 再討論結果
    uncertainty: dict[str, Any]                   # 最終不確実性
    judgment: dict[str, Any]                      # 人間の最終判断


# ---------------------------------------------------------------------------
# ノード実装
# ---------------------------------------------------------------------------

_ANALYSIS_INSTRUCTION = (
    "以下の議題について、あなたの専門領域の観点から分析してください。\n"
    "必ず次のJSON形式のみで回答してください（前後に説明文を付けない）：\n"
    '{{"summary": "150字以内の総括", '
    '"key_points": ["論点1", "論点2", "論点3"], '
    '"stance": "賛成|反対|中立|条件付き", '
    '"confidence": 0.0〜1.0の数値}}\n\n'
    "議題：{topic}"
)


async def _analyze_one(
    persona_id: str, topic: str, evidence: str = ""
) -> tuple[str, dict[str, Any]]:
    persona = PERSONAS[persona_id]
    user = _ANALYSIS_INSTRUCTION.format(topic=topic)
    if evidence:
        user += (
            "\n\n参考情報（Web検索結果。妥当なものは根拠として活用し、"
            "使った場合は本文中に [1] のように番号で示してください）：\n" + evidence
        )
    try:
        raw = await call_llm(
            system=persona["system"],
            user=user,
            preferred=persona["preferred"],
        )
        result = safe_json(raw)
    except LLMError as exc:
        result = {"summary": "（分析に失敗しました）", "error": str(exc),
                  "key_points": [], "stance": "—", "confidence": 0.0}
    result["name"] = persona["name"]
    result["role"] = persona["role"]
    result["provider"] = resolve_provider(persona["preferred"])
    return persona_id, result


async def web_research(state: EpiphanyState) -> dict[str, Any]:
    """議題について Web 検索し、根拠（出典つき）を集める。

    グラフの最初に走り、結果を後続の賢者・モデレーターのプロンプトに注入する。
    無効化時や検索失敗時は空の結果を返し、通常分析に degrade する。
    """
    if not WEB_SEARCH_ENABLED:
        return {"research": {"query": "", "results": [], "enabled": False}}
    query = state["topic"].strip()
    results = await web_search(query)
    return {"research": {"query": query, "results": results, "enabled": True}}


def make_analysis_node(persona_id: str):
    """1賢者ぶんの分析ノードを生成する。

    各賢者を独立ノードにすることで、web_research の後に fan-out で並列実行され、
    `astream(stream_mode="updates")` で「完了した賢者から順に」結果を取り出せる
    （SSE ストリーミングの土台）。analyses は _merge リデューサで合流する。
    """

    async def _node(state: EpiphanyState) -> dict[str, Any]:
        evidence = _format_evidence(state.get("research"))
        _, result = await _analyze_one(persona_id, state["topic"], evidence)
        return {"analyses": {persona_id: result}}

    _node.__name__ = f"analyze_{persona_id}"
    return _node


_MODERATOR_INSTRUCTION = (
    "あなたは議論のモデレーター（議長補佐）です。3人の賢者の分析を統合し、"
    "対立点（争点）と不確実性を抽出してください。\n"
    "必ず次のJSON形式のみで回答してください：\n"
    '{{"synthesis": "3者の見解を統合した200字以内の要約", '
    '"consensus": ["合意点1", "合意点2"], '
    '"contention_points": [{{"id": "c1", "title": "争点の見出し", '
    '"description": "何が対立しているかの説明", '
    '"positions": {{"melchior": "立場", "balthasar": "立場", "casper": "立場"}}}}], '
    '"uncertainty": {{"score": 0.0〜1.0, "drivers": ["不確実性の要因1", "要因2"]}}}}\n\n'
    "議題：{topic}\n\n"
    "MELCHIOR-1（データ）の分析：{melchior}\n"
    "BALTHASAR-2（リスク）の分析：{balthasar}\n"
    "CASPER-3（創造）の分析：{casper}"
)


async def moderator(state: EpiphanyState) -> dict[str, Any]:
    """3分析を統合し、争点と不確実性を抽出。"""
    a = state["analyses"]
    user = _MODERATOR_INSTRUCTION.format(
        topic=state["topic"],
        melchior=json.dumps(a.get("melchior", {}), ensure_ascii=False),
        balthasar=json.dumps(a.get("balthasar", {}), ensure_ascii=False),
        casper=json.dumps(a.get("casper", {}), ensure_ascii=False),
    )
    evidence = _format_evidence(state.get("research"))
    if evidence:
        user += "\n\n参考情報（Web検索結果）：\n" + evidence
    try:
        raw = await call_llm(
            system="あなたは中立かつ論理的な議論のモデレーターです。",
            user=user,
            preferred="anthropic",
        )
        return {"moderator": safe_json(raw)}
    except LLMError as exc:
        return {"moderator": {"synthesis": "（統合に失敗しました）", "error": str(exc),
                              "consensus": [], "contention_points": [],
                              "uncertainty": {"score": 0.0, "drivers": []}}}


_ROUND2_INSTRUCTION = (
    "次の争点について、あなたの立場を再検討し、相手の論拠も踏まえて再反論または"
    "歩み寄りを示してください。\n"
    "必ず次のJSON形式のみで回答してください：\n"
    '{{"revised_summary": "再検討後の見解(150字以内)", '
    '"rebuttal": "他の賢者への反論または同意", '
    '"stance": "賛成|反対|中立|条件付き", '
    '"confidence": 0.0〜1.0}}\n\n'
    "争点：{point}\n"
    "現在の各賢者の立場：{positions}"
)


async def _debate_one(
    persona_id: str, point: dict[str, Any]
) -> tuple[str, dict[str, Any]]:
    persona = PERSONAS[persona_id]
    try:
        raw = await call_llm(
            system=persona["system"],
            user=_ROUND2_INSTRUCTION.format(
                point=json.dumps(point, ensure_ascii=False),
                positions=json.dumps(point.get("positions", {}), ensure_ascii=False),
            ),
            preferred=persona["preferred"],
        )
        result = safe_json(raw)
    except LLMError as exc:
        result = {"revised_summary": "（再討論に失敗しました）", "error": str(exc),
                  "rebuttal": "—", "stance": "—", "confidence": 0.0}
    result["name"] = persona["name"]
    return persona_id, result


async def round2_debate(state: EpiphanyState) -> dict[str, Any]:
    """選択された争点で 3 賢者が再討論。"""
    point = state["selected_point"]
    results = await asyncio.gather(
        *(_debate_one(pid, point) for pid in PERSONAS)
    )
    return {"round2": {"point": point, "responses": dict(results)}}


_UNCERTAINTY_INSTRUCTION = (
    "再討論を踏まえ、議題全体の不確実性を再評価してください。\n"
    "必ず次のJSON形式のみで回答してください：\n"
    '{{"score": 0.0〜1.0, "delta": "前回比の変化の説明", '
    '"drivers": ["残る不確実性の要因"], "recommendation": "議長への助言(100字以内)"}}\n\n'
    "再討論の内容：{round2}\n"
    "前回の不確実性：{prev}"
)


async def uncertainty_update(state: EpiphanyState) -> dict[str, Any]:
    """再討論後の不確実性スコアを再計算。"""
    prev = state.get("moderator", {}).get("uncertainty", {})
    try:
        raw = await call_llm(
            system="あなたは不確実性を定量評価するアナリストです。",
            user=_UNCERTAINTY_INSTRUCTION.format(
                round2=json.dumps(state["round2"], ensure_ascii=False),
                prev=json.dumps(prev, ensure_ascii=False),
            ),
            preferred="anthropic",
        )
        return {"uncertainty": safe_json(raw)}
    except LLMError as exc:
        return {"uncertainty": {"score": prev.get("score", 0.0), "error": str(exc),
                                "delta": "再計算に失敗", "drivers": [], "recommendation": "—"}}


async def record_judgment(state: EpiphanyState) -> dict[str, Any]:
    """人間の最終判断を記録して終了。"""
    judgment = dict(state.get("judgment", {}))
    judgment.setdefault("recorded", True)
    return {"judgment": judgment}


# ---------------------------------------------------------------------------
# グラフ構築
# ---------------------------------------------------------------------------


def build_graph_definition() -> StateGraph:
    g = StateGraph(EpiphanyState)

    # Web検索 → 3賢者 fan-out（並列）→ moderate fan-in
    g.add_node("web_research", web_research)
    g.add_edge(START, "web_research")
    for pid in PERSONAS:
        node_name = f"analyze_{pid}"
        g.add_node(node_name, make_analysis_node(pid))
        g.add_edge("web_research", node_name)
        g.add_edge(node_name, "moderate")

    g.add_node("moderate", moderator)  # ノード名は state キー "moderator" と衝突させない
    g.add_node("round2_debate", round2_debate)
    g.add_node("uncertainty_update", uncertainty_update)
    g.add_node("record_judgment", record_judgment)

    g.add_edge("moderate", "round2_debate")
    g.add_edge("round2_debate", "uncertainty_update")
    g.add_edge("uncertainty_update", "record_judgment")
    g.add_edge("record_judgment", END)
    return g


def compile_with_memory():
    """開発用：メモリチェックポインタでコンパイル（同期）。"""
    return build_graph_definition().compile(
        checkpointer=MemorySaver(), interrupt_before=INTERRUPT_BEFORE
    )
