# CLAUDE.md

このファイルは、本リポジトリのコードを扱う際の Claude Code（claude.ai/code）向けガイドです。

## このリポジトリの正体

同じことをする3つの独立したフロントエンド — Web 記事を、AI で生成し文字数制限に合わせた X / Facebook / Threads 向け投稿に変換する — に加え、たまたま同じディレクトリに同居する別物の note.com 公開ツール。

3つのフロントエンドは UX（X 280 / Threads 500 / Facebook 無制限、コピー + シェアインテントのボタン、任意の編集）を共有するが、**コードは共有しない**。それぞれが自己完結しており、前のものの制約を取り除くために作られた：

| フロントエンド | エントリ | LLM | 記事抽出 | 存在理由 |
| --- | --- | --- | --- | --- |
| Streamlit アプリ | `app.py` | Anthropic（`claude-sonnet-4-6`） | サーバー側、`trafilatura` 経由 | 最初の版。ホスト Mac の稼働が必要 |
| Chrome サイドパネル拡張 | `chrome_extension/`（MV3） | Anthropic（`claude-sonnet-4-6`）。拡張コンテキストから `fetch`、`anthropic-dangerous-direct-browser-access: true` 付き | アクティブタブへの `chrome.scripting.executeScript` | Chrome ユーザーのサーバー依存を除去 |
| ブックマークレット | `bookmarklet_gemini.{js,html}`、`bookmarklet_post.{js,html}`、`bookmarklet.html` | Gemini（`gemini-2.5-flash-lite`） | `document.querySelector('article'/'main'/…)` 後に `innerText` | サーバーと拡張の両方を除去。モバイル含む任意のブラウザで動く |

note.com 関連（`note_publisher.py`、`post_note.py`、`draft_note.md`）は、下書きを note.com に公開する無関係の CLI — 作者がこのプロジェクト*について*の記事を下書きするため、ここに置いている。`.env` ファイルだけを共有し、他は何も共有しない。

## 重要な不変条件（壊してはいけない）

リファクタ中に踏みやすい制約のクイックリファレンス。各項目は後続の該当セクションで詳述しているので、手を入れる前に必ずそちらを読むこと。

- **3フロントエンドはコード非共有** — 1つを直しても他には反映されない。修正は対象フロントエンドごとに行う。
- **ブックマークレットの JS はリポジトリ内ファイルそのものではない** — jsDelivr CDN 経由でロードされる。`bookmarklet_*.js` の編集は GitHub の `main` に commit & push しないと反映されない。ファイルのリネーム/移動はインストール済みブックマークレットを全世界で壊す。（→ *ブックマークレットのローダー方式*）
- **ブックマークレット JS は自己完結を維持** — import なし・ビルドステップなし。ホストページ上で動くため識別子は短く保つ（衝突回避）。
- **Chrome 拡張は直叩きヘッダが必須** — `anthropic-dangerous-direct-browser-access: true` と `host_permissions: ["https://api.anthropic.com/*"]`。（→ *Chrome 拡張*）
- **Streamlit のシステムプロンプトは `cache_control: {type: "ephemeral"}`** — プロンプトキャッシュを効かせるためリクエスト間で安定させること。（→ *Streamlit アプリ*）
- **note.com の公開は2段階 + フォールバック** — `/v3` への `PUT` 後 `POST` のフォールバックは両方残すこと（エンドポイントが不安定なため）。（→ *note.com パブリッシャ*）
- **`AIで生成：試験運用中` の開示マーカーを維持** — 3フロントエンドすべてが AI 生成本文の先頭に付与する。プロンプト/出力フローに触れる際は保持すること。
- **モデル ID を固定** — Anthropic → `claude-sonnet-4-6`、Gemini → `gemini-2.5-flash-lite`。
- **UI 文字列・コメント・コミットメッセージは日本語** — 既存スタイルに合わせる。

## コマンド

```bash
# Streamlit アプリ（0.0.0.0:8501 にバインド）
pip install -r requirements.txt
streamlit run app.py

# note.com CLI — 新規下書き
python post_note.py --title "タイトル" --body draft_note.md

# note.com CLI — 即時公開
python post_note.py --title "タイトル" --body draft_note.md --status published

# note.com CLI — 既存ノートの更新
python post_note.py --update n1234abcd --title "新タイトル" --body draft_note.md

# Chrome 拡張 — chrome://extensions から chrome_extension/ を「パッケージ化されていない拡張機能」として読み込む
# ブックマークレット — bookmarklet_post.html / bookmarklet_gemini.html をブラウザで開き、
#   ボタンをブックマークバーにドラッグ。ページの「ローカル実行」ボタンを使えば、
#   GitHub に push せずに bookmarklet_*.js の編集をテストできる。
```

テスト・リンター・ビルドステップは未設定。

## 環境変数（`.env`）

| 変数 | 用途 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Streamlit アプリが使用。Chrome 拡張とブックマークレットは各自の UI でキーを入力させ、クライアント側に保存する（`chrome.storage.local` / `localStorage`）。 |
| `NOTE_SESSION_MIT` | ログイン済み note.com セッションの `_note_session_v5` クッキー値。`post_note.py` が必要とする。DevTools → Application → Cookies から取得。 |

## プロジェクト構成

| パス | 役割 |
| --- | --- |
| `app.py` | Streamlit アプリ（単一ファイル）。記事取得 + Anthropic 呼び出し + UI。 |
| `chrome_extension/` | MV3 拡張。`sidepanel.html`/`.js`（パネル UI）、`background.js`（`openPanelOnActionClick` の配線のみ）、`manifest.json`。 |
| `bookmarklet_post.{js,html}` | 投稿版ブックマークレット。引用＋コメント入力→SNS投稿。AI提案（ハッシュタグ・Threadsトピック）に Gemini を使用。 |
| `bookmarklet_gemini.{js,html}` | Gemini 版ブックマークレット。記事全体を X・Facebook・Threads 向けに自動要約。 |
| `bookmarklet.html` | ブックマークレット関連の HTML。 |
| `note_publisher.py` | `NotePublisher` クラス。note.com の非公開 API を叩く（別物のツール）。 |
| `post_note.py` | note.com 公開用の CLI エントリ。 |
| `draft_note.md` | note.com に投稿する下書き本文。 |
| `.streamlit/config.toml` | Streamlit 設定。`0.0.0.0:8501` に headless でバインド。 |

## 編集前に知っておくべきアーキテクチャ詳細

### ブックマークレットのローダー方式（重要）

ブラウザにインストールされるブックマークレットは、リポジトリ内の JS ファイル**そのものではない**。HTML ページ（`bookmarklet_post.html`、`bookmarklet_gemini.html`）が、`<script>` を注入する小さな `javascript:` ローダーを生成し、その `src` は **GitHub 上のこのリポジトリを指す jsDelivr CDN URL** になっている：

```
https://cdn.jsdelivr.net/gh/bassie0303/002_article-summarizer@main/002_article_share/bookmarklet_post.js
```

帰結：

- **`bookmarklet_*.js` への編集は、GitHub の `main` に commit & push して初めて反映される**。さらに jsDelivr のキャッシュ期限後（`?t=Date.now()` でローダー自体はキャッシュバストできるが、jsDelivr はコミット単位でキャッシュする）。HTML ページには「ローカル実行」テストボタンもある — push 前の反復はこれを使う。
- JS ファイルは自己完結を維持すること：import なし、ビルドステップなし。ホストページのコンテキストで動くため、衝突を最小化するよう識別子はすべて短い（`Q='_sp'`、`Q='_sg'`）。
- HTML は `002_article-summarizer` リポジトリの `main` ブランチ `002_article_share/` にある。これらの JS ファイルのリネームや移動は、インストール済みブックマークレットを全世界で壊す。
- **リポジトリは public 必須** — jsDelivr CDN は private リポジトリにアクセスできない。Settings で visibility を変更した場合はブックマークレットが即時停止する。CDNキャッシュのパージは `https://purge.jsdelivr.net/gh/bassie0303/002_article-summarizer@main/002_article_share/<filename>` で手動実行できる。

### bookmarklet_post.js の仕様詳細

- **Gemini API キー**：`localStorage` キー `_gemk` に保存。パネル内の入力欄（`id="_spgk"`）から読み取る。`window.prompt()` は Android Chrome でブロックされるため廃止済み。
- **引用テキストのクリーニング**：`cleanQt()` 関数が選択・クリップボード・ペーストの全タイミングで適用される。行頭の半角スペース・タブ・全角スペース（`　`）を除去し、空行を削除する。
- **クリップボード自動読み取り**：パネルを開いた時に `navigator.clipboard.readText()` を試みる。権限エラー等で失敗した場合は引用欄をフォーカスし、ユーザーが手動ペーストできるようにする。

### Chrome 拡張

- サイドパネル付きの Manifest V3（`sidepanel.html`/`.js`）。`background.js` は `openPanelOnActionClick` を配線するだけ。
- 拡張はパネルコンテキストから Anthropic API を直接呼ぶ。これには `manifest.json` の `anthropic-dangerous-direct-browser-access: true` と `host_permissions: ["https://api.anthropic.com/*"]` が必要。API キーは `chrome.storage.local` に置く。
- 記事テキストは、固定のセレクタ列（`article`、`main`、`[role=main]`、`.post-content`、…）を走査する一回限りの `chrome.scripting.executeScript` 注入から得る。`chrome://` ページや PDF では動かない。

### Streamlit アプリ

- `app.py` は単一ファイル。`fetch_article` は `trafilatura.bare_extraction` を使い、タイトルは BeautifulSoup にフォールバック（`og:title` → `<title>` → `<h1>`）。
- API キーの扱い：`python-dotenv` で `.env` から読み、サイドバー UI から `set_key` で in-place に書き換え可能。別個のシークレットストアは無い。
- システムプロンプトは `cache_control: {type: "ephemeral"}` 付きで送る — Anthropic のプロンプトキャッシュを実際に効かせるため、リクエスト間で安定させること。
- `.streamlit/config.toml` は `0.0.0.0:8501` に headless でバインド。

### note.com パブリッシャ（別物のツール）

- `note_publisher.py` の `NotePublisher` は、`_note_session_v5` クッキーを設定して非公開の `note.com/api/v1` および `v3` エンドポイントと通信する。公開は2段階の手順：`POST /v1/text_notes` で ID を得て、`POST /v1/text_notes/draft_save` を `is_temp_saved=false` で叩いて公開する。保存レスポンスに公開ステータスが出ない場合、`_do_publish` は `/v3/notes/{key}` への `PUT` 次いで `POST` を試すフォールバックに入る — これらのエンドポイントは不安定なので、両方の試行を残すこと。
- 本文は `_to_html` で最小限の HTML（`<p>` + `<br>`）に変換される — note.com のエディタはこれを受け付ける。
- アカウントは `ACCOUNTS` 辞書にショート名（`_mit`）をキーとして設定され、それぞれが環境変数（`NOTE_SESSION_MIT`）を指す。

## 規約

- UI 文字列・コメント・コミットメッセージは日本語。編集時は既存スタイルに合わせること。
- 新しい LLM 呼び出しを追加する際に使うモデル ID：Anthropic → `claude-sonnet-4-6`、Gemini → `gemini-2.5-flash-lite`（ブックマークレットがこれに標準化した。古いコミットは `gemini-2.0-flash` / `gemini-1.5-flash` を参照している）。
- 3つのフロントエンドはすべて、AI 生成の投稿本文の先頭に開示マーカーとして `AIで生成：試験運用中` を付ける — プロンプト/出力フローに触れる際は保持すること。
