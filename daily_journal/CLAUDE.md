# CLAUDE.md

このファイルは、本リポジトリのコードを扱う際の Claude Code（claude.ai/code）向けガイドです。

## 概要

1日分のデータ（Google Photos / Facebook 投稿 / X / Instagram / Google Maps 訪問場所）を収集し、Claude API（vision）で日記 JSON（`title` / `body` / `summary` / `tags`）を生成、それを **NotebookLM・Notion・自己完結型 HTML** の3経路に配信するローカル実行の Python CLI。エントリポイントは `main.py`（`python main.py [--date YYYY-MM-DD] ...`）の単一。

パイプラインは「収集（collectors/）→ 生成（processors/summarizer.py）→ 配信（publishers/）」の3段で、中間状態は `output/YYYY-MM-DD/diary.json` に保存され `--only-publish` で再出力できる。

## 重要な不変条件（壊してはいけない）

リファクタ中に踏みやすい制約のクイックリファレンス。各項目は後続の該当セクションで詳述しているので、手を入れる前に必ずそちらを読むこと。

- **`collectors/google_photos.py` は隣接リポジトリ `../note_auto_post/` に依存する** — `sys.path.insert(0, _PARENT)` で `note_auto_post/google_photos_playwright.py`・`local_photos.py`・`location.py` を import する。このリポジトリ単独では Google Photos 収集が動かない。パスを動かす・隣接ディレクトリを消すと静かに壊れる。（→ *アーキテクチャ / 外部依存と隣接リポジトリ*）
- **`[写真N]`（全角カッコ・全角「写真」・10進）プレースホルダーが配信側プロトコル** — `processors/summarizer.py` のプロンプトで本文に挿入させ、`publishers/notion.py` と `publishers/webpage.py` が `re.split(r"(\[写真\d+\])")` / `re.sub(r"\[写真(\d+)\]", ...)` で正規表現マッチして画像ブロック化する。表記をいじると全配信先で写真が出なくなる。（→ *アーキテクチャ / 写真プレースホルダー*）
- **オプショナル収集・配信は env 未設定でも main を落とさない** — `_safe_collect` / `_safe` で例外を握り、ログを出して空リスト・スキップで続行する。各 collector/publisher 側で `raise ValueError("XXX が未設定です")` を投げて構わない（呼び出し側で握る）。逆に「必須化」する改修は main フローのスキップ前提を壊す。（→ *アーキテクチャ / フェイルソフトの方針*）
- **Notion DB のプロパティ名は外部スキーマ** — `Name`(title) / `Date`(date) / `Tags`(multi_select) / `Summary`(rich_text) を事前に作成しておく契約。`publishers/notion.py` の `properties` キーをリネームすると Notion 側 400 になる。（→ *環境変数* / *アーキテクチャ / Notion 配信*）
- **Notion への写真は callout プレースホルダーで埋め込み不可** — `_image_placeholder` はファイル名を青背景 callout で表示するだけ。Notion 公開 API にファイルアップロードが無いことが理由なので、「実画像が出ない」のはバグではない仕様。実画像が必要なら HTML を見る運用。（→ *アーキテクチャ / Notion 配信*）
- **NotebookLM 配信は Playwright 非ヘッドレス + 永続 Chrome プロファイル前提** — `credentials/chrome_profile/` に Google ログイン状態を保存する。`headless=False` / `channel="chrome"` / `--disable-blink-features=AutomationControlled` の組合せが BOT 検出回避と手動ログインの両立に必要。ヘッドレス化・プロファイル削除・CI 化はそのままでは通らない。（→ *アーキテクチャ / NotebookLM 配信*）
- **NotebookLM の UI セレクタは多言語フォールバックの配列** — `_click_first` に英語 / 日本語 / aria-label / data-testid の候補リストを並べて順に試す構造。1個に絞らないこと（UI ロケール差・A/B 差で壊れる）。Google 側の UI 変更で全滅したら例外で `output/notebooklm_error.png` を残して落ちる設計。（→ *既知のクセ*）
- **生成に使う Claude モデルは `claude-sonnet-4-6` 固定（プロンプトキャッシュ有効）** — `processors/summarizer.py` の `_client.messages.create(model=..., system=[{... "cache_control": {"type":"ephemeral"}}])`。新規 LLM 呼び出しを足すときも同じモデル ID を使い、`cache_control` を外さない。（→ *アーキテクチャ / 日記生成*）
- **`output/YYYY-MM-DD/diary.json` の `collected.photos[].local_path` は `str`（Path 不可）** — `_serializable` で Path → str に正規化して保存する。`--only-publish` 時はこの JSON をそのまま読むので、収集側で構造を変えるなら `_serializable` も併せて直す。（→ *アーキテクチャ / 中間 JSON と再出力*）
- **記述言語は日本語** — UI 文字列・ログ・コメント・コミットメッセージは日本語、識別子と環境変数名は英語。既存の絵文字付きログ（`✅` / `⚠️` / `❌` / `📅` 等）も含めて踏襲する。

## コマンド

```bash
# セットアップ（新環境）
pip install -r requirements.txt
playwright install chromium
cp .env.example .env   # キー類を埋める

# 通常実行（昨日分）
python main.py

# 日付指定 & よく使う組み合わせ
python main.py --date 2026-05-15
python main.py --date 2026-05-15 --skip-maps --no-notebooklm --open

# 既存 diary.json から配信のみ再実行
python main.py --date 2026-05-15 --only-publish
```

テストスイート・リンター・フォーマッターは未設定。検証は実データで `main.py` を走らせ、`output/<date>/diary.html` を `--open` で目視確認するのが標準フロー。Playwright を含む統合フローは CI 化されていない。

### CLI オプション

| オプション | 動作 |
| --- | --- |
| `--date YYYY-MM-DD` | 対象日。省略時は昨日（`date.today() - timedelta(days=1)`） |
| `--skip-photos` | Google Photos 収集をスキップ |
| `--skip-social` | X / Facebook / Instagram 収集をまとめてスキップ |
| `--skip-maps` | Google Maps（Takeout）収集をスキップ |
| `--no-notebooklm` | NotebookLM 配信をスキップ |
| `--no-notion` | Notion 配信をスキップ |
| `--only-publish` | 収集をスキップし `output/<date>/diary.json` から配信のみ |
| `--open` | 完了後に `output/<date>/diary.html` を `open` で開く |

## デプロイ

ローカル実行専用。サーバー・コンテナ・スケジューラは未設定（`.github/workflows/` 無し）。macOS 上で `python main.py` を直接叩く前提で、NotebookLM 配信は GUI ブラウザを開くため非対話実行・SSH 越し実行には向かない。

## 環境変数

`.env`（ローカルに置き、`.gitignore` 済み）から `python-dotenv` 経由で読み込む。未設定時の挙動は各 collector / publisher 側で「必須が無ければ `ValueError` → 上位の `_safe*` がスキップ」になる。

| 変数 | 用途 |
| --- | --- |
| `ANTHROPIC_API_KEY` | **必須**。未設定だと `main.py` が日記生成前に終了する |
| `TWITTER_BEARER_TOKEN` / `TWITTER_USER_ID` | X API v2。未設定なら X 収集をスキップ（有料プラン要のため実質スキップ運用） |
| `META_ACCESS_TOKEN` | Facebook / Instagram 共用の Meta Graph API トークン。長期トークンでも 60 日で失効するため定期的に再発行が必要 |
| `FACEBOOK_USER_ID` | Facebook 投稿取得対象のユーザー ID |
| `INSTAGRAM_BUSINESS_ID` | Instagram Business / Creator アカウント ID。個人アカウントは Graph API 不可のため運用上未設定 |
| `GMAPS_TAKEOUT_DIR` | Google Takeout 「Semantic Location History」フォルダ。省略時は `~/Downloads/Takeout/Location History/Semantic Location History`。2024 年以降の Takeout はフォーマット変更で取れないことが多い |
| `NOTION_TOKEN` | Notion インテグレーションのシークレット |
| `NOTION_DB_ID` | 配信先の日記 DB ID。`-` は `publishers/notion.py` 内で除去する |
| `NOTEBOOKLM_NOTEBOOK_URL` | 事前に手動作成しておいたノートブックの URL（`https://notebooklm.google.com/notebook/...`）。未設定なら NotebookLM 配信をスキップ |

## プロジェクト構成

| パス | 役割 |
| --- | --- |
| `main.py` | CLI エントリ。引数解析 → `_collect` → `processors.summarizer.generate_diary` → 各 publisher の順に呼ぶ |
| `config.py` | `.env` 読み込み・全体の定数（パス、`MAX_PHOTOS=10`、`MAX_IMAGE_PX=1568`、モデル設定は summarizer 側にハードコード） |
| `collectors/google_photos.py` | Playwright で Google Photos から当日写真を取得し EXIF→GPS→逆ジオコードまで補完。`../note_auto_post/` の関数を流用 |
| `collectors/facebook.py` | Meta Graph API v19.0 で `feed` を JST 範囲で取得・ページネーション対応 |
| `collectors/instagram.py` | Meta Graph API v19.0 で Business/Creator アカウントの `media` を取得（要 INSTAGRAM_BUSINESS_ID） |
| `collectors/twitter.py` | X API v2 `users/{id}/tweets`。Bearer Token と数値ユーザー ID 必須 |
| `collectors/google_maps.py` | Takeout の `Semantic Location History/<YEAR>/<YEAR>_<MONTH>.json` を読み訪問場所を抽出 |
| `processors/summarizer.py` | Claude `claude-sonnet-4-6` に写真＋コンテキストを投げて日記 JSON を返させる。`_resize`（最大 1568px）・`_parse_json`（改行エスケープ補正） |
| `publishers/notion.py` | Notion DB にページ作成、`[写真N]` を callout プレースホルダーに、本文は段落＋ 2000 字チャンク、100 ブロック超は分割 PATCH |
| `publishers/notebooklm.py` | Playwright で NotebookLM の "Add source" → "Paste text" → 入力 → "Insert" を操作。多言語セレクタ |
| `publishers/webpage.py` | 自己完結型 HTML を生成。写真は base64 で `<img>` に埋め込み（オフライン閲覧可） |
| `output/YYYY-MM-DD/` | 実行ごとの成果物。`diary.json`（中間状態）・`diary.html`・`photos/` |
| `credentials/chrome_profile/` | Playwright 永続コンテキスト。Google ログイン状態を保持 |
| `HANDOFF.md` | 過去の引き継ぎメモ。トークン更新手順・各 API 採否の経緯あり |
| `.env.example` | env テンプレート。各サービスの取得元 URL コメント付き |

## アーキテクチャ

### 収集 → 生成 → 配信の3段パイプライン

`main.py:main()` が中心。`--only-publish` 以外では `_collect` がスキップフラグを見ながら 5 つの collector を順に呼び、各々は `_safe_collect` で包まれているため例外は警告ログだけ出して空リストに落ちる。続いて `processors.summarizer.generate_diary` が `collected` を丸ごと受け取って Claude を呼び、`{"title","body","summary","tags"}` を返す。最後に NotebookLM → Notion → HTML の順に `_safe` 経由で呼ぶ（順序は配信先間に依存関係は無いが、HTML はローカルファイル生成なので最後に置いてある）。

### 中間 JSON と再出力

生成直後に `output/<date>/diary.json` に `{"diary": ..., "collected": _serializable(collected)}` を書き、`--only-publish` 時はこの JSON を読み戻して配信フェーズだけ実行する。`_serializable` は `photos[].local_path` を `Path → str` に正規化する小さな関数で、これがあるため publisher 側は常に `str` を受け取れる前提で書かれている。`Path(p["local_path"]).exists()` のチェックは publisher 側にも入っている（写真ファイルを削除しても落ちない）。

### 日記生成（`processors/summarizer.py`）

- モデル: `claude-sonnet-4-6`、`max_tokens=3000`、system プロンプトに `cache_control: ephemeral` を付与。
- メッセージは「指示テキスト → 写真1 → "[写真1] 撮影地: X" → 写真2 → ... → MAX_PHOTOS 枚（10）」の交互配置。
- 写真は `_resize` で長辺 1568px 以下に縮小して base64 化。
- 出力 JSON は前後に余計な文字が混ざる可能性があるため `_parse_json` で `{` 〜 `}` を切り出し、文字列内の生の改行を `\\n` にエスケープして `json.loads`。
- プロンプトは `body` 内に `[写真N]` を挿入させ、その表記が下流の配信側で画像ブロックに化ける契約。

### 写真プレースホルダー

`[写真N]`（N は 1 始まりの整数）は3レイヤを通る共通プロトコル：
1. 生成（summarizer）: 写真添付枚数に応じてプロンプトで挿入を指示
2. Notion 配信（`_parse_segments`）: `re.split(r"(\[写真\d+\])")` で本文を分割し、写真インデックスのファイル名 callout に置換
3. HTML 配信（`_body_to_html`）: `re.sub(r"\[写真(\d+)\]", ...)` で `<figure><img src="data:image/jpeg;base64,...">` に置換

表記（全角カッコ・「写真」・10進数）を変えると3か所同時に修正が必要。

### Notion 配信

- DB の `parent.database_id` は `NOTION_DB_ID.replace("-", "")` で正規化して送る。
- `Tags`(multi_select) はタグ名を `{"name": t}` で渡す（DB 側にタグが無くても自動作成される）。
- 本文ブロックは Notion API の「children は最大 100」制限に合わせ、最初の 100 個は `POST /pages`、残りは `PATCH /blocks/{page_id}/children` を 100 個ずつチャンクで追記する。
- 1 段落 2000 字制限に合わせて `_text_to_paragraphs` がチャンク分割する。
- 写真は **callout プレースホルダーのみ**。公開 Notion API にファイルアップロードが無いため、実画像を埋めたい場合は HTML を見る運用。

### NotebookLM 配信

- 事前に NotebookLM 側で対象ノートブックを手動作成し、その URL を `NOTEBOOKLM_NOTEBOOK_URL` に入れる契約。新規ノートブック作成は自動化していない。
- `playwright.sync_api.sync_playwright` で `launch_persistent_context(user_data_dir=credentials/chrome_profile, channel="chrome", headless=False, slow_mo=400)`。Google 認証は初回手動、以降はプロファイル再利用。
- 認証チェックは `if "accounts.google.com" in page.url:` → `page.wait_for_url("**/notebooklm.google.com/**", timeout=180_000)` で最大 3 分待つ。
- UI 操作 `_add_text_source`：「Add source ボタン」→「Copied text / Paste text 選択」→「textarea or contenteditable に `fill` / type」→「Insert ボタン」→「`Processing...` が消えるまで 3 分待機」。各ステップは `_click_first` に英日両方のセレクタ候補を渡して順に試す。
- 失敗時は `output/notebooklm_error.png` にスクリーンショットを残して `RuntimeError` で抜ける。

### 外部依存と隣接リポジトリ

`collectors/google_photos.py` の冒頭で `sys.path.insert(0, .../note_auto_post/)` を行い、隣の `note_auto_post/` 配下にある `google_photos_playwright.download_photos`・`local_photos._extract_gps`・`location.reverse_geocode` を import している。これは「単独リポジトリ」ではなく「`note_auto_post/` と兄弟ディレクトリで配置される前提」を意味する。リポジトリを単独で他所に移すと Google Photos 収集が即座に失敗する（`_safe_collect` で握られて空リストに落ちるが、写真ゼロで日記が生成される）。

### フェイルソフトの方針

`_safe_collect` / `_safe` は **収集側の失敗は警告で握って続行**、**配信側の失敗もエラー表示で握って続行** という方針。`ANTHROPIC_API_KEY` 未設定だけは main 冒頭で即終了する（=日記生成自体が成立しないため）。改修時にこの「失敗を握って続行」のセマンティクスを「失敗で止める」に変えると、一部 API トークン切れで全配信が止まるリグレッションを起こす。

## 既知のクセ / コードに見えるが違うもの

- **`twitter.py` / `instagram.py` / `google_maps.py` は実装はあるが運用上スキップ** — `HANDOFF.md` に経緯あり（X は有料プラン、Instagram は Meta アプリタイプ制約、Maps は 2024 年以降の Takeout フォーマット変更）。コード自体は正しく動く想定で残してある。消す前に運用復活の可能性を確認すること。
- **`META_ACCESS_TOKEN` は 60 日で失効する** — 失効後は Graph API Explorer で短期トークンを発行 → `oauth/access_token?grant_type=fb_exchange_token` で長期に交換する手順（詳細は `HANDOFF.md`）。プログラム側に自動リフレッシュは無い。
- **NotebookLM 配信は対話実行前提** — `headless=False` のため、SSH 越しや cron での無人実行はそのままでは不可。仮想ディスプレイか、配信スキップ運用が前提。
- **`credentials/chrome_profile/` は `.gitignore` 済み** — リポジトリには入らない。新環境では初回実行時に Google 手動ログインが必要。
- **`__pycache__/` が collectors/ processors/ publishers/ 各所に残っている** — 過去の実行残骸。削除しても問題ない。
- **`output/notebooklm_error.png`** — NotebookLM の Playwright 操作が失敗したときだけ書かれるデバッグ用スクリーンショット。コード生成物ではない。
