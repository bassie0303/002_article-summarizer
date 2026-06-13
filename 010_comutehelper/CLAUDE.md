# CLAUDE.md

このファイルは、本リポジトリのコードを扱う際の Claude Code（claude.ai/code）向けガイドです。

## 概要

電車の空席情報をリアルタイムに匿名共有する PWA（MVP・Phase 1）。「席の予約」ではなく「もうすぐ空く席の気配」を可視化するレーダー。

実装本体は `ikkyu-app/` 配下の **Next.js（フロント） ＋ FastAPI（バックエンド／PostgreSQL or SQLite）** の2サブプロジェクト。リポジトリ直下の `.docx` / `.md` / `PATENT_REVIEW.md` は企画書・特許検討資料であり、アプリの実行には関与しない。

主なエンドポイント／フロー：

- フロント（`ikkyu-app/frontend`）: `/`（Google ログイン）→ `/select`（路線・方向・乗車駅・号車を選択）→ `/offer/new`（ドナーが2タップで席登録）／`/radar`（レシーバーが空席を WS で受信）
- バック（`ikkyu-app/backend`）: `POST /offers` / `GET /offers` / `PATCH /offers/{id}` / `DELETE /offers/{id}` / `WS /ws/radar` ＋ APScheduler の `purge_expired_offers` ジョブ

## 重要な不変条件（壊してはいけない）

リファクタ中に踏みやすい制約のクイックリファレンス。各項目は後続の該当セクションで詳述しているので、手を入れる前に必ずそちらを読むこと。

- **降車駅名はサーバーに送らない／保存しない** — クライアントが駅 index 差から「残り駅数(`exit_in_stops`)」の整数に変換して送る。スキーマにも駅名カラムは存在しない。これを破ると個人移動履歴の漏洩につながる。（→ *プライバシー構造担保*）
- **`user_id` 生値は保存・返却しない** — 受け口の Bearer JWT から取り出した `sub` を `hash_user_id()` で SHA-256 ハッシュ化したものだけが DB と API レスポンスに出る。`SeatOfferPublic` に `user_hash` 自体も含めない。（→ *認証と匿名化*）
- **フロント `IKKYU_API_SECRET` と バック `API_JWT_SECRET` は同じ値にする** — フロントの `/api/token` が HS256 で署名し、FastAPI が同じ鍵で検証する共有鍵方式。片方だけ更新すると 401 が連発する。（→ *認証と匿名化*）
- **降車後オファーは物理削除（論理削除しない）** — 手動 `DELETE /offers/{id}` も、`expires_at` 経過時の `purge_expired_offers` ジョブも `session.delete()` で物理 DELETE する。論理削除に書き換えるとプライバシー要件を満たさなくなる。（→ *降車後の自動消去*）
- **DB は起動時に `Base.metadata.create_all` で作成（Alembic 未導入）** — `app/main.py` の lifespan で毎回スキーマを揃える MVP 方式。モデル変更時は本番でも手動でカラム調整が必要。（→ *スキーマ運用*）
- **ローカル開発のバックエンドは 8010 番ポート** — 8000 は別プロジェクト Epiphany が使う。`frontend/.env.local` の `NEXT_PUBLIC_API_BASE=http://localhost:8010` と合わせる。本番（Railway）は `$PORT` を Dockerfile が拾うので無関係。（→ *コマンド*）
- **`DATABASE_URL` は `postgresql://`／`postgres://` を受け取って良い** — `app/core/config.py:normalize_db_url` が asyncpg 用に書き換え、`sslmode` クエリも除去する。Railway/Render が渡す素の URL をそのまま設定値にして良い。（→ *環境変数*）
- **記述言語は日本語** — UI 文字列・コメント・コミットメッセージは日本語で統一。`README.md` / `DEPLOY.md` / コード内ドキュストリングが全て日本語であることに合わせる。

## コマンド

```bash
# バックエンド（ikkyu-app/backend）
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                    # DATABASE_URL / API_JWT_SECRET / USER_HASH_SALT 等を設定
uvicorn app.main:app --reload --port 8010   # → http://localhost:8010/health , /docs

# Postgres も brew postgres も無い場合のフォールバック
# .env で DATABASE_URL=sqlite+aiosqlite:///./ikkyu_dev.db を指定

# Docker 一発起動（Postgres 付き、ポートは 8000）
cd ikkyu-app && docker compose up

# フロントエンド（ikkyu-app/frontend）
npm run dev      # → http://localhost:3000
npm run build    # 本番ビルド
npm run lint     # ESLint (eslint-config-next)
```

テストスイートは未設定。検証は (a) ブラウザで `/select` → `/offer/new` → `/radar` の手動 E2E、(b) `GET /health` と `/docs` でバックエンド疎通を確認する。バックエンドのリンター／フォーマッターも未設定。

## デプロイ

**フロント＝Vercel ／ バックエンド＝Railway（PostgreSQL も Railway）** で動かす想定（詳細手順は `ikkyu-app/DEPLOY.md`）。

- バック：`ikkyu-app/backend/Dockerfile` を Railway が検出。`CMD` は `uvicorn ... --port ${PORT:-8000}` で `$PORT` を吸収する。Service の **Root Directory** を `backend` に設定する。
- フロント：Vercel に `frontend` を Root Directory として登録。`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` は Google Cloud Console の OAuth クライアントから発行し、リダイレクト URI に `https://<本番ドメイン>/api/auth/callback/google` を登録する。
- 相互参照：Railway の `FRONTEND_ORIGIN` に Vercel 本番 URL を、Vercel の `NEXT_PUBLIC_API_BASE` に Railway 本番 URL を入れて両方再デプロイする。`NEXT_PUBLIC_*` はビルド時埋め込みなので変更後の再ビルド必須。
- WS：`API_BASE` を `ws://` / `wss://` に置換するだけ（フロント側は `radar/page.tsx` で `http`→`ws` 文字列置換）。Railway は WebSocket をサポート済み。
- 本番では `ALLOW_DEV_LOGIN` / `NEXT_PUBLIC_ALLOW_DEV_LOGIN` を **設定しない**（未設定で自動的に Google 必須になる）。

## 環境変数

### バックエンド（`ikkyu-app/backend/.env`）

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | 接続先。`postgresql://` / `postgres://` のままで OK（`asyncpg` 用に自動変換）。未設定時は `postgresql+asyncpg://ikkyu:ikkyu@localhost:5432/ikkyu`。SQLite フォールバックは `sqlite+aiosqlite:///./ikkyu_dev.db`。 |
| `API_JWT_SECRET` | フロント `/api/token` が署名し、FastAPI が検証する HS256 共有鍵。フロントの `IKKYU_API_SECRET` と**一致必須**。 |
| `USER_HASH_SALT` | `user_id` を SHA-256 ハッシュ化する際のソルト。本番では必ず固有値に上書き。 |
| `FRONTEND_ORIGIN` | CORS で許可するフロントのオリジン。Railway では Vercel 本番 URL を入れる。`http://localhost:3000` は別途固定許可。 |
| `PORT` | Railway が自動注入。Dockerfile の `${PORT:-8000}` で吸収。ローカルでは未使用（`uvicorn --port 8010` を直接指定）。 |

その他に `Settings` クラスのデフォルトとして `offer_default_ttl_seconds=1800`、`purge_interval_seconds=60` がコードに持たれている（環境変数で上書き可能）。

### フロントエンド（`ikkyu-app/frontend/.env.local` ／ Vercel 環境変数）

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | バックの公開 URL。ローカルは `http://localhost:8010`。**ビルド時に埋め込まれる**ため変更後は再デプロイ必須。 |
| `AUTH_SECRET` | NextAuth(Auth.js v5) のセッション暗号化鍵。`openssl rand -base64 32` で生成。 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth クライアントの ID／シークレット。未設定だと Google ログインボタンは失敗する。 |
| `IKKYU_API_SECRET` | `/api/token` の HS256 署名鍵。バックの `API_JWT_SECRET` と**一致必須**。 |
| `ALLOW_DEV_LOGIN` / `NEXT_PUBLIC_ALLOW_DEV_LOGIN` | `true` のとき、Google なしで任意の ID 文字列でログインできる開発用バイパス。本番では未設定にする。 |

## プロジェクト構成

| パス | 役割 |
| --- | --- |
| `ikkyu-app/` | アプリ本体（独立した GitHub リポジトリ化してデプロイする想定） |
| `ikkyu-app/docker-compose.yml` | ローカル Postgres ＋ backend のセット起動（こちらは 8000 番で公開） |
| `ikkyu-app/DEPLOY.md` | Vercel + Railway の本番デプロイ完全手順 |
| `ikkyu-app/backend/` | FastAPI ＋ SQLAlchemy(async) ＋ WebSocket ＋ APScheduler |
| `ikkyu-app/backend/app/main.py` | エントリ。lifespan で `create_all` ＋ purge ジョブ起動、CORS 設定 |
| `ikkyu-app/backend/app/core/config.py` | `Settings`（pydantic-settings）。`normalize_db_url` で `postgresql+asyncpg://` に整形 |
| `ikkyu-app/backend/app/core/security.py` | `Authorization: Bearer <JWT>` を HS256 検証し、`sub` をソルト付き SHA-256 でハッシュ化 |
| `ikkyu-app/backend/app/models/models.py` | `User` / `SeatOffer` ORM。**降車駅名カラムは存在しない**（`exit_in_stops` 整数のみ） |
| `ikkyu-app/backend/app/models/schemas.py` | Pydantic I/O。`SeatOfferPublic` は `user_hash` を含めない |
| `ikkyu-app/backend/app/routers/offers.py` | POST/GET/PATCH/DELETE。WS への `offer_created` / `offer_updated` / `offer_removed` 配信元 |
| `ikkyu-app/backend/app/routers/radar.py` | `/ws/radar?line_id=&car_number=` 購読 |
| `ikkyu-app/backend/app/services/purge.py` | `expires_at <= now()` を物理 DELETE する定期ジョブ |
| `ikkyu-app/backend/app/services/ws_manager.py` | `"{line_id}:{car_number}"` をキーにしたメモリ内ルーム |
| `ikkyu-app/frontend/src/auth.ts` | NextAuth(v5)＋Google。`token.sub` を session に載せる |
| `ikkyu-app/frontend/src/app/api/token/route.ts` | セッション or `?dev=<id>` から `jose` で署名付き JWT を発行 |
| `ikkyu-app/frontend/src/lib/auth.ts` | クライアント側ログイン/トークン取得（メモリキャッシュあり） |
| `ikkyu-app/frontend/src/lib/api.ts` | `apiFetch` — `Bearer <token>` を自動付与。204 は JSON パースしない |
| `ikkyu-app/frontend/src/lib/lines.ts` | 路線・駅・座標・座席レイアウトの静的データ（上り方向で定義） |
| `ikkyu-app/frontend/src/lib/gps.ts` | ハバーサインで最寄り駅 index を算出 |
| `ikkyu-app/frontend/src/lib/my-offer.ts` | 自分の登録中オファーを localStorage に保持し、解除 API を呼ぶ |
| `ikkyu-app/frontend/src/components/car-map.tsx` | `donor` / `radar` 両用の車内図 |
| `ikkyu-app/frontend/src/app/{page,select,offer/new,radar}/page.tsx` | 画面本体（後述のフロー） |
| `ikkyu-app/frontend/AGENTS.md` | **Next.js 16 系で破壊的変更あり。コード書く前に `node_modules/next/dist/docs/` を読むこと**、という frontend 専用の警告 |
| `ikkyu_tsukin_shi_spec.md` / `ikkyu_tsukinshi_spec_v1.docx` / `電車の空席予測共有アプリ企画書.docx` | 企画書類。コードではない |
| `PATENT_REVIEW.md` | 特許出願検討資料。生成 AI に評価させる用。コードではない |

## アーキテクチャ

### プライバシー構造担保（駅名を一切持たない）

「降車駅情報を漏らさない」をアプリのレイヤーではなく**スキーマと API 定義**で担保している。`SeatOffer` モデルに駅名のカラムは存在せず、`SeatOfferCreate` も `exit_in_stops: int (0..30)` しか受け付けない。`/offer/new` 側で「降車駅 index − 現在駅 index」を計算して送るため、サーバーは降車駅を知らない。GPS による残り駅数更新（`PATCH /offers/{id}`）も同じ規約で `exit_in_stops` だけを差し替える。

レシーバー側の `/radar` は `seat_id` と `exit_in_stops` を受け取って色分け表示するだけで、降車駅名は表示しない（できない）設計。

### 認証と匿名化

```
ブラウザ ── Google ログイン ──> NextAuth (Auth.js v5)
                                     │ session.user.id = Google sub
                                     ▼
                              /api/token (HS256 で署名)
                                     │ JWT(sub=Google sub or "dev:<id>")
                                     ▼
                              FastAPI (Bearer 検証 → sub をハッシュ化)
                                     │ user_hash だけを保存
```

- フロント `IKKYU_API_SECRET` ＝ バック `API_JWT_SECRET`（HS256 共有鍵）。Vercel と Railway の双方で**同じ値**を設定する。
- バックは `app/core/security.py:hash_user_id` で `SHA-256("{salt}:{sub}")` を取り、生 `sub` をそれ以降一切使わない。`SeatOfferPublic` には `user_hash` すら含めない。
- 開発用ログインは `/api/token?dev=<id>` 経由で `sub = "dev:<id>"` の JWT を発行する経路。`ALLOW_DEV_LOGIN=true` のときだけ通る。

### 同一車両ルームの WebSocket（PostGIS 不使用）

- `room_key(line_id, car_number) = f"{line_id}:{car_number}"` を ID にした in-memory な `defaultdict(set)` ルーム。
- `POST /offers` / `PATCH /offers/{id}` / `DELETE /offers/{id}` の各 API が、同 `room_key` の購読者に `offer_created` / `offer_updated` / `offer_removed` を broadcast する。
- レシーバーは `/ws/radar?line_id=&car_number=` で接続し、初期データを `GET /offers` で取得した後、差分は WS で受ける。
- ルームはプロセス内 dict なので、本番でバックを複数インスタンスにする場合は Redis pub/sub 等への置き換えが要る（現状 Railway のシングルインスタンス前提）。

### 降車後の自動消去

`session.delete()` での**物理削除**を2系統用意：

1. **本人による即時解除** — `DELETE /offers/{id}` が `user_hash` 照合（403 で他人弾き）→ 物理削除 → `offer_removed` を WS 配信。
2. **解除し忘れの保険** — `app/services/purge.py:purge_expired_offers` を APScheduler が `purge_interval_seconds`（既定60秒）で実行し、`expires_at <= now()` を一括 DELETE。`offer_default_ttl_seconds`（既定30分）が POST 時に `expires_at` として確定する。

論理削除（`is_deleted` フラグ化など）に書き換えると非機能要件「降車後は跡を残さない」を満たさなくなる。

### 路線データの方向（上り／下り）規約

`frontend/src/lib/lines.ts` の `stations[]` / `coords[]` は**常に上り（都心方向）順**で定義されている。`/select` と `/offer/new` / `/radar` 各画面は、下り選択時に呼び出し側で `[...stations].reverse()` / `[...coords].reverse()` した配列を `gps.ts` や残り駅数計算に渡す。配列の定義順を変えると上下両方の方向で逆走するので注意。

### スキーマ運用（Alembic 未導入）

`app/main.py` の lifespan で毎回 `Base.metadata.create_all` を呼ぶ。

- 新規カラム追加は**既存テーブルには適用されない**（SQLAlchemy の `create_all` は CREATE IF NOT EXISTS 相当）。
- 本番で列を増やしたい場合は手動 `ALTER TABLE` か、`DROP TABLE` → 再起動が必要。
- 将来 Alembic に移すべきだが、MVP のうちは触らない方針（既存コメントにも明記）。

### CORS

`app/main.py` で次の3パターンを許可している：

- `settings.frontend_origin`（環境変数で指定する本番ドメイン）
- `http://localhost:3000`（ローカル開発用に固定追加）
- `allow_origin_regex=r"https://ikkyu-tsukinshi.*\.vercel\.app"`（Vercel のプレビュー URL は動的に変わるため正規表現で一括許可）

新しいプレビュー URL を別プロジェクト名で動かす場合は regex を更新すること。

## 既知のクセ / コードに見えるが違うもの

- **`backend/ikkyu_dev.db` / `ikkyu_ws.db`** — ローカル SQLite のフォールバック実体。`.gitignore` で `backend/*.db` を除外しているのに過去のスナップが残っているだけ。リポジトリの状態を変えるな。
- **`backend/.venv/`** — 開発者のローカル venv 一式。仮想環境再生成はローカルでのみ行うこと。
- **`docker-compose.yml` のポート** — ローカル `uvicorn` 起動は **8010**、`docker compose up` は **8000** とポートが異なる。フロントの `NEXT_PUBLIC_API_BASE` を環境に合わせて切り替える。
- **`frontend/AGENTS.md`（→ `CLAUDE.md` が参照）** — 「This is NOT the Next.js you know」と書かれており、frontend は Next.js 16.2.7 系の破壊的変更を含む。フロントで新しいコードを書く前に `node_modules/next/dist/docs/` の該当ガイドを参照すること。
- **`PATENT_REVIEW.md` / `ikkyu_tsukinshi_spec_v1.docx` / `電車の空席予測共有アプリ企画書.docx` / `~$kyu_tsukinshi_spec_v1.docx`** — 全て企画・特許検討用のドキュメント。コードではないので実行系のリファクタからは無視して良い。`~$...docx` は Word のロックファイルで誤ってコミットされた可能性がある（削除候補）。
- **`/offers` GET は認証必須だが引数名が `_user_hash`** — `routers/offers.py:list_offers` の依存注入は副作用のみで使われる（hash 自体は不要）。アンダーバー始まりは「未使用引数だが依存解決のために必要」を示す慣習。削らないこと。
- **`SeatOffer.visibility` カラム** — `all` / `women_priority` / `trust_priority` / `safe` を想定したフィールドが既にあるが、Phase 1 のクライアントは常に `"all"` で送る。Phase 3 機能用の前置きで、現状は読み書きされても挙動を変えない。

## 公開前チェック

**このプロジェクトは特許出願を検討中である**（`PATENT_REVIEW.md` 参照）。`ikkyu-app/` リポジトリを public 化する、外部に公開 URL を共有する、ブログ等で実装詳細を発信する、といったアクションの前に**必ず出願状況を確認すること**。新規性喪失となる開示は出願後でも国・条文により取り扱いが異なるため、判断は出願代理人に確認するまで保留する。
