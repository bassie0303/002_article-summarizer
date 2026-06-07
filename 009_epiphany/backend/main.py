"""Epiphany — FastAPI サーバー

3AI 相互査読フローの HTTP インターフェース。LangGraph グラフを
セッション(thread_id)単位で実行し、interrupt/resume で人間の介入を挟む。
"""

from __future__ import annotations

import os
import uuid
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

# --- 環境変数のロード ---
# override=True：シェルに空の ANTHROPIC_API_KEY 等が export されていても .env を優先する。
# 共有(claude_test/.env)を先に、backend/.env を後に読み、より具体的な方を勝たせる。
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR.parent.parent / ".env", override=True)  # claude_test/.env を使い回す
load_dotenv(_BACKEND_DIR / ".env", override=True)

import json  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

_FRONTEND = _BACKEND_DIR.parent / "frontend" / "index.html"

from graph import (  # noqa: E402
    _HAS_ANTHROPIC,
    _HAS_GEMINI,
    _HAS_OPENAI,
    INTERRUPT_BEFORE,
    build_graph_definition,
)

DATABASE_URL = os.getenv("DATABASE_URL")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# グラフとチェックポインタ種別をアプリ起動時に確定する
_GRAPH: Any = None
_CHECKPOINTER_KIND = "memory"

# セッション一覧用の軽量インデックス（session_id→メタ）。
# LangGraph のチェックポインタはスレッド横断の列挙APIを持たないため別途保持する。
# 永続化時は同じ DB（sqlite or postgres）の sessions テーブルに書き、起動時に読み戻す。
_SESSIONS: dict[str, dict[str, Any]] = {}
_SESSION_BACKEND: Optional[str] = None  # "sqlite" | "postgres" | None(=memory)
_SESSION_DSN: Optional[str] = None      # sqlite ファイルパス or postgres URL

_SESSION_CREATE_SQL = {
    "sqlite": (
        "CREATE TABLE IF NOT EXISTS sessions ("
        "session_id TEXT PRIMARY KEY, created_at REAL, topic TEXT, stage TEXT, decision TEXT)"
    ),
    "postgres": (
        "CREATE TABLE IF NOT EXISTS sessions ("
        "session_id TEXT PRIMARY KEY, created_at DOUBLE PRECISION, topic TEXT, stage TEXT, decision TEXT)"
    ),
}
_SESSION_UPSERT_SQL = {
    "sqlite": (
        "INSERT INTO sessions (session_id, created_at, topic, stage, decision) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(session_id) DO UPDATE SET "
        "created_at=excluded.created_at, topic=excluded.topic, "
        "stage=excluded.stage, decision=excluded.decision"
    ),
    "postgres": (
        "INSERT INTO sessions (session_id, created_at, topic, stage, decision) "
        "VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (session_id) DO UPDATE SET "
        "created_at=EXCLUDED.created_at, topic=EXCLUDED.topic, "
        "stage=EXCLUDED.stage, decision=EXCLUDED.decision"
    ),
}
_SESSION_SELECT_SQL = "SELECT session_id, created_at, topic, stage, decision FROM sessions"


def _row_to_entry(row: Any) -> dict[str, Any]:
    return {
        "session_id": row[0],
        "created_at": row[1],
        "topic": row[2],
        "stage": row[3],
        "decision": row[4],
    }


async def _init_session_store(backend: str, dsn: str) -> None:
    """sessions テーブルを用意し、既存行を _SESSIONS に読み戻す（sqlite/postgres 両対応）。"""
    global _SESSION_BACKEND, _SESSION_DSN
    _SESSION_BACKEND, _SESSION_DSN = backend, dsn

    if backend == "sqlite":
        import aiosqlite

        async with aiosqlite.connect(dsn) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute(_SESSION_CREATE_SQL["sqlite"])
            await db.commit()
            async with db.execute(_SESSION_SELECT_SQL) as cur:
                async for row in cur:
                    _SESSIONS[row[0]] = _row_to_entry(row)
    elif backend == "postgres":
        import psycopg

        async with await psycopg.AsyncConnection.connect(dsn) as conn:
            async with conn.cursor() as cur:
                await cur.execute(_SESSION_CREATE_SQL["postgres"])
                await conn.commit()
                await cur.execute(_SESSION_SELECT_SQL)
                for row in await cur.fetchall():
                    _SESSIONS[row[0]] = _row_to_entry(row)
    print(f"[epiphany] セッション索引を復元: {len(_SESSIONS)} 件 ({backend})")


async def _touch_session(session_id: str, **fields: Any) -> None:
    """セッション索引を upsert する（メモリ＋DB）。初回に created_at を付与。"""
    import time

    entry = _SESSIONS.get(session_id)
    if entry is None:
        entry = {
            "session_id": session_id,
            "created_at": time.time(),
            "topic": None,
            "stage": "running",
            "decision": None,
        }
        _SESSIONS[session_id] = entry
    entry.update({k: v for k, v in fields.items() if v is not None})

    if not _SESSION_BACKEND or not _SESSION_DSN:
        return

    params = (
        entry["session_id"],
        entry["created_at"],
        entry["topic"],
        entry["stage"],
        entry["decision"],
    )
    try:
        if _SESSION_BACKEND == "sqlite":
            import aiosqlite

            async with aiosqlite.connect(_SESSION_DSN) as db:
                await db.execute("PRAGMA busy_timeout=5000")
                await db.execute(_SESSION_UPSERT_SQL["sqlite"], params)
                await db.commit()
        elif _SESSION_BACKEND == "postgres":
            import psycopg

            async with await psycopg.AsyncConnection.connect(_SESSION_DSN) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(_SESSION_UPSERT_SQL["postgres"], params)
                await conn.commit()
    except Exception as exc:  # noqa: BLE001 — 永続化失敗は致命的でない
        print(f"[epiphany] session 永続化に失敗: {exc}")


def _resolve_sqlite_path(url: Optional[str]) -> str:
    """DATABASE_URL から SQLite ファイルパスを解決する（相対は backend/ 基準）。"""
    default = str(_BACKEND_DIR / "epiphany.db")
    if not url or url.startswith("postgres"):
        return default
    if url.startswith("sqlite"):
        # sqlite:///./x.db → "./x.db" / sqlite:////abs/x.db → "/abs/x.db"
        rest = url[len("sqlite://"):]
        path = rest if rest.startswith("//") else rest.lstrip("/")
        path = path[1:] if path.startswith("/") and rest.startswith("//") else path
    else:
        path = url
    if not path:
        return default
    p = Path(path)
    return str(p if p.is_absolute() else _BACKEND_DIR / p)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """チェックポインタを postgres → sqlite → memory の順に確定する。

    - DATABASE_URL が postgresql:// なら Postgres を試す（本番/Railway 想定）
    - それ以外（sqlite:// or 未指定）は SQLite ファイルで永続化（ローカル開発）
    - いずれも失敗した場合のみ MemorySaver（非永続）に退避
    """
    global _GRAPH, _CHECKPOINTER_KIND
    definition = build_graph_definition()

    async with AsyncExitStack() as stack:
        checkpointer = None
        sqlite_path: Optional[str] = None

        # 1) Postgres（明示指定時のみ）
        if DATABASE_URL and DATABASE_URL.startswith("postgres"):
            try:
                from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

                checkpointer = await stack.enter_async_context(
                    AsyncPostgresSaver.from_conn_string(DATABASE_URL)
                )
                await checkpointer.setup()
                _CHECKPOINTER_KIND = "postgres"
            except Exception as exc:  # 接続不可なら SQLite に退避
                print(f"[epiphany] Postgres 接続に失敗、SQLite にフォールバック: {exc}")
                checkpointer = None

        # 2) SQLite（postgres 未使用 or 失敗時）
        if checkpointer is None:
            try:
                from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

                sqlite_path = _resolve_sqlite_path(DATABASE_URL)
                checkpointer = await stack.enter_async_context(
                    AsyncSqliteSaver.from_conn_string(sqlite_path)
                )
                await checkpointer.setup()
                _CHECKPOINTER_KIND = "sqlite"
            except Exception as exc:
                print(f"[epiphany] SQLite 初期化に失敗、MemorySaver に退避: {exc}")
                checkpointer = None
                sqlite_path = None

        # 3) 最後の砦：メモリ（非永続）
        if checkpointer is None:
            from langgraph.checkpoint.memory import MemorySaver

            checkpointer = MemorySaver()
            _CHECKPOINTER_KIND = "memory"

        _GRAPH = definition.compile(
            checkpointer=checkpointer, interrupt_before=INTERRUPT_BEFORE
        )

        # セッション索引も同じ DB に永続化し、既存分を読み戻す（memory 時はスキップ）
        try:
            if _CHECKPOINTER_KIND == "postgres" and DATABASE_URL:
                await _init_session_store("postgres", DATABASE_URL)
            elif _CHECKPOINTER_KIND == "sqlite" and sqlite_path:
                await _init_session_store("sqlite", sqlite_path)
        except Exception as exc:  # noqa: BLE001 — 索引初期化失敗でも起動は継続
            print(f"[epiphany] セッション索引の初期化に失敗（索引は非永続で継続）: {exc}")

        print(f"[epiphany] グラフ起動完了 (checkpointer={_CHECKPOINTER_KIND})")
        yield


app = FastAPI(title="Epiphany API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# リクエスト/レスポンス モデル
# ---------------------------------------------------------------------------


class Round1Request(BaseModel):
    topic: str


class Round2Request(BaseModel):
    session_id: str
    selected_point: dict[str, Any]


class JudgmentRequest(BaseModel):
    session_id: str
    judgment: dict[str, Any]


def _config(session_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": session_id}}


def _require_graph():
    if _GRAPH is None:
        raise HTTPException(status_code=503, detail="グラフが未初期化です")
    return _GRAPH


async def _state_values(session_id: str) -> dict[str, Any]:
    snapshot = await _require_graph().aget_state(_config(session_id))
    if not snapshot or not snapshot.values:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")
    return snapshot.values


# ---------------------------------------------------------------------------
# エンドポイント
# ---------------------------------------------------------------------------


@app.post("/api/round1")
async def round1(req: Round1Request) -> dict[str, Any]:
    """3ノード並列分析を実行し、新規セッションを作成する。"""
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="議題（topic）が空です")

    graph = _require_graph()
    session_id = str(uuid.uuid4())
    # interrupt まで実行され、moderator の結果を抱えて一時停止する
    await graph.ainvoke({"topic": req.topic}, _config(session_id))

    values = await _state_values(session_id)
    await _touch_session(session_id, topic=req.topic, stage="select_point")
    return {
        "session_id": session_id,
        "topic": values.get("topic"),
        "research": values.get("research", {}),
        "analyses": values.get("analyses", {}),
        "moderator": values.get("moderator", {}),
        "stage": "select_point",
    }


def _sse(event: str, data: dict[str, Any]) -> str:
    """SSE フレームを組み立てる（1イベント = event 行 + data 行 + 空行）。"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/round1/stream")
async def round1_stream(req: Round1Request) -> StreamingResponse:
    """Round1 を SSE でストリーミングする。

    LangGraph の astream(stream_mode="updates") を使い、各賢者ノードが完了した
    瞬間に `analysis` イベントを、モデレーター完了時に `moderator` イベントを push する。
    完了後はチェックポインタに状態が残るため round2/judgment はそのまま利用できる。

    イベント種別:
      session   … {session_id, topic}      （開始直後）
      analysis  … {id, analysis}            （賢者1人ぶん完了ごと）
      moderator … {moderator}              （統合完了）
      done      … {session_id, stage}        （interrupt 到達＝Round1完了）
      error     … {detail}                  （失敗）
    """
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="議題（topic）が空です")

    graph = _require_graph()
    session_id = str(uuid.uuid4())
    config = _config(session_id)

    async def event_stream():
        yield _sse("session", {"session_id": session_id, "topic": req.topic})
        await _touch_session(session_id, topic=req.topic, stage="running")
        try:
            async for chunk in graph.astream(
                {"topic": req.topic}, config, stream_mode="updates"
            ):
                for node, update in chunk.items():
                    if not isinstance(update, dict):
                        continue
                    if node == "web_research":
                        yield _sse("research", {"research": update.get("research", {})})
                    elif node.startswith("analyze_"):
                        for pid, result in (update.get("analyses") or {}).items():
                            yield _sse("analysis", {"id": pid, "analysis": result})
                    elif node == "moderate":
                        yield _sse("moderator", {"moderator": update.get("moderator", {})})
            await _touch_session(session_id, stage="select_point")
            yield _sse("done", {"session_id": session_id, "stage": "select_point"})
        except Exception as exc:  # noqa: BLE001 — ストリームで一様にエラー通知
            yield _sse("error", {"detail": f"ストリーミング中にエラー: {exc}"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # リバースプロキシのバッファリング抑止
        },
    )


@app.post("/api/round2")
async def round2(req: Round2Request) -> dict[str, Any]:
    """選択された争点で再討論する（static interrupt からの再開）。

    selected_point を state に注入してから None で再開すると、
    round2_debate → uncertainty_update が走り record_judgment の直前で停止する。
    """
    graph = _require_graph()
    config = _config(req.session_id)
    await _state_values(req.session_id)  # 存在チェック

    await graph.aupdate_state(config, {"selected_point": req.selected_point})
    await graph.ainvoke(None, config)

    values = await _state_values(req.session_id)
    await _touch_session(req.session_id, stage="judgment")
    return {
        "session_id": req.session_id,
        "round2": values.get("round2", {}),
        "uncertainty": values.get("uncertainty", {}),
        "stage": "judgment",
    }


@app.post("/api/judgment")
async def judgment(req: JudgmentRequest) -> dict[str, Any]:
    """人間（議長）の最終判断を記録する（static interrupt からの再開）。"""
    graph = _require_graph()
    config = _config(req.session_id)
    await _state_values(req.session_id)  # 存在チェック

    await graph.aupdate_state(config, {"judgment": req.judgment})
    await graph.ainvoke(None, config)

    values = await _state_values(req.session_id)
    await _touch_session(
        req.session_id, stage="done", decision=req.judgment.get("decision")
    )
    return {
        "session_id": req.session_id,
        "judgment": values.get("judgment", {}),
        "stage": "done",
    }


@app.get("/api/sessions")
async def list_sessions() -> dict[str, Any]:
    """セッション一覧を新しい順に返す（履歴画面用）。"""
    items = sorted(
        _SESSIONS.values(), key=lambda s: s["created_at"], reverse=True
    )
    return {"sessions": items}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    """セッション履歴を取得する（チェックポインタから復元）。"""
    values = await _state_values(session_id)
    snapshot = await _require_graph().aget_state(_config(session_id))
    next_nodes = list(snapshot.next) if snapshot and snapshot.next else []
    if "round2_debate" in next_nodes:
        stage = "select_point"
    elif "record_judgment" in next_nodes:
        stage = "judgment"
    elif not next_nodes:
        stage = "done"
    else:
        stage = "running"
    return {
        "session_id": session_id,
        "topic": values.get("topic"),
        "research": values.get("research", {}),
        "analyses": values.get("analyses", {}),
        "moderator": values.get("moderator", {}),
        "selected_point": values.get("selected_point", {}),
        "round2": values.get("round2", {}),
        "uncertainty": values.get("uncertainty", {}),
        "judgment": values.get("judgment", {}),
        "stage": stage,
    }


@app.get("/")
async def index() -> FileResponse:
    """フロントエンド(index.html)を同一オリジンで配信する（CORS不要で動く）。"""
    if not _FRONTEND.exists():
        raise HTTPException(status_code=404, detail="frontend/index.html が見つかりません")
    return FileResponse(_FRONTEND)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    """ヘルスチェック・DB / プロバイダ状態確認。"""
    return {
        "status": "ok",
        "checkpointer": _CHECKPOINTER_KIND,
        "providers": {
            "anthropic": _HAS_ANTHROPIC,
            "openai": _HAS_OPENAI,
            "gemini": _HAS_GEMINI,
        },
    }
