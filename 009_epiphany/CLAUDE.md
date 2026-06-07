# Epiphany — Claude Code コンテキスト

## プロジェクト概要
東方の三博士（賢者）をモチーフにした、**3AIによる相互査読・議論アプリ**。
複数AIが独立して分析し、対立点と不確実性を可視化。最終判断は人間（議長）が行う。

## 技術スタック
| レイヤー | 技術 |
|---|---|
| Frontend | HTML / Vanilla JS（→ Next.js App Router に移行予定）|
| Backend | FastAPI (Python) |
| AI Orchestration | **LangGraph** StateGraph |
| DB | **PostgreSQL**（LangGraph Checkpointer で自動永続化）|
| AI Model | Claude API（claude-sonnet-4-20250514）|

## ディレクトリ構成
```
epiphany/
├── CLAUDE.md               ← このファイル
├── backend/
│   ├── graph.py            ← LangGraph グラフ定義（コアロジック）
│   ├── main.py             ← FastAPI サーバー + エンドポイント
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    └── index.html          ← UI（MAGI風ダークテーマ）
```

## 重要ファイルの役割

### backend/graph.py
LangGraphの `StateGraph` でフロー全体を管理。

```
[START]
  → parallel_analysis    # 3ノード並列（asyncio.gather）
  → moderator            # 統合判断・争点抽出・不確実性スコア
  → [END / 一時停止]     # ユーザーが争点を選ぶ待機
  → round2_debate        # 選択争点で再討論（LangGraph resume）
  → uncertainty_update   # 不確実性スコア再計算
  → [END / 一時停止]
  → record_judgment      # 最終判断記録
```

ノード構成：
- **MELCHIOR-1**（データ・統計分析）
- **BALTHASAR-2**（リスク・倫理評価）
- **CASPER-3**（創造・提案）
- **MODERATOR**（統合・争点抽出）

### backend/main.py
| エンドポイント | 説明 |
|---|---|
| POST /api/round1 | 3ノード並列分析・セッション作成 |
| POST /api/round2 | 争点を選んで再討論（LangGraph resume）|
| POST /api/judgment | 人間の最終判断を記録 |
| GET /api/session/{id} | セッション履歴取得（PostgreSQL復元）|
| GET /api/health | ヘルスチェック・DB状態確認 |

## 環境変数
```
ANTHROPIC_API_KEY=sk-ant-...        # 必須
DATABASE_URL=postgresql://...       # 省略時はMemorySaverで動作（開発用）
CORS_ORIGINS=http://localhost:3000
PORT=8000
```

## 開発サーバー起動
```bash
# PostgreSQL（Docker）
docker run -d --name epiphany-db \
  -e POSTGRES_USER=epiphany -e POSTGRES_PASSWORD=epiphany -e POSTGRES_DB=epiphany \
  -p 5432:5432 postgres:16

# バックエンド
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## UIデザインの原則
- 三博士をモチーフにしたダークテーマ（星・旅・啓示）
- カラー: MELCHIOR=#3b82f6 / BALTHASAR=#ec4899 / CASPER=#f97316
- フォント: Orbitron（見出し）/ Share Tech Mono（本文）
- スキャンライン・グロー・タイプライターアニメーション

## 今後の実装予定（優先順位順）
1. **Next.js App Router への移行**（frontend/）
2. **ストリーミング対応**（Server-Sent Events）
3. **OpenAI API 追加**（MELCHIOR を実際の ChatGPT に）
4. **Gemini API 追加**（CASPER を実際の Gemini に）
5. **Web検索ツール統合**（LangGraph Tool Node）
6. **セッション履歴一覧画面**
7. **認証・マルチユーザー対応**

## コーディング規約
- Python: 型ヒント必須、async/await 統一
- JSON レスポンスは `safe_json()` でパース（graph.py 参照）
- LangGraph のステート変更は必ず `dict` を返す
- エラーは HTTPException で統一、detail に日本語メッセージ可
