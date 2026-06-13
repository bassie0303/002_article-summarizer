# 不動産物件情報トラッカー

Gmail / LINE から不動産物件情報を自動取得して Google Sheets に蓄積します。

## 構成

| ファイル | 役割 |
|---|---|
| Code.gs | エントリーポイント・Web App |
| Config.gs | 設定定数 |
| GmailProcessor.gs | Gmail 自動処理 |
| ClaudeAPI.gs | Claude API 抽出 |
| SheetsWriter.gs | Sheets 書き込み |
| DriveHandler.gs | 添付PDF保存 |
| webapp.html | LINE 入力フォーム |

## セットアップ手順

### 1. Google スプレッドシートを作成
- 新規スプレッドシートを作成
- URLから ID をコピー（`/d/XXXXX/edit` の `XXXXX` 部分）

### 2. Google Apps Script プロジェクト作成
- スプレッドシートのメニュー「拡張機能」→「Apps Script」を開く
- 各 `.gs` ファイルの内容をコピペ（ファイル名そのままで作成）
- `webapp.html` もファイル追加してコピペ
- `appsscript.json` の内容でプロジェクト設定を上書き（「表示」→「appsscript.json を表示」）

### 3. Script Properties に API キーを設定
「プロジェクトの設定」→「スクリプト プロパティ」→ 以下を追加：

| プロパティ名 | 値 |
|---|---|
| `CLAUDE_API_KEY` | sk-ant-... |
| `SHEET_ID` | スプレッドシートのID |

### 4. Gmail ラベル作成とフィルター設定
1. GAS エディタで `createGmailLabel()` を実行 → ラベル「不動産物件」が作成される
2. Gmail の設定 → フィルタ → 以下のフィルタを作成：
   - **To:** `bassie4re@gmail.com`（転送元のアドレスを宛先指定）
   - → アクション：ラベル「不動産物件」を適用
   - また不動産会社からの直接メールもこのラベルに含める

### 5. 初回セットアップ実行
GAS エディタで `setup()` 関数を実行 → シート初期化 + 30分トリガー登録

### 6. LINE Messaging API チャネル作成

1. [LINE Developers](https://developers.line.biz/) にログイン
2. プロバイダーを作成 → 「Messaging API」チャネルを作成
3. チャネル基本設定 → **チャネルアクセストークン（長期）** を発行してコピー
4. Script Properties に追加:
   | プロパティ名 | 値 |
   |---|---|
   | `LINE_CHANNEL_ACCESS_TOKEN` | 発行したトークン |
   | `LINE_WEBHOOK_SECRET` | 任意のランダム文字列（例: `re2025abc`） |

### 7. Web App デプロイ（Webhook 兼 手動フォーム）

- 「デプロイ」→「新しいデプロイ」→ 種類:ウェブアプリ
- 実行ユーザー: 自分（USER_DEPLOYING）
- アクセスできるユーザー: **全員（ANYONE_ANONYMOUS）**← LINE からのリクエストを受け取るため
- デプロイ後に発行される URL をコピー

### 8. LINE Webhook URL を設定

1. LINE Developers → Messaging API 設定 → Webhook URL に以下を設定:
   ```
   https://script.google.com/macros/s/SCRIPT_ID/exec?secret=YOUR_LINE_WEBHOOK_SECRET
   ```
   （`SCRIPT_ID` と `YOUR_LINE_WEBHOOK_SECRET` は実際の値に置き換え）
2. 「Webhookの利用」を ON にする
3. 「検証」ボタンで 200 OK が返ることを確認

## 使い方

### Gmail（自動）
30分ごとに自動実行。「不動産物件」ラベル付きの未読メールを処理。
処理済みメールは「物件処理済み」ラベルが付いて既読になります。

### LINE Bot（自動）
1. LINE アプリで発行した Bot の QR コードを友だち追加
2. 不動産業者から来た物件情報をそのまま Bot にコピペ（転送）して送信
3. Bot が自動で解析 → スプレッドシートに保存 → 完了メッセージを返信

### LINE フォーム（手動補助）
Web App URL をブラウザで開くと従来の手動入力フォームも引き続き使えます。

## Sheets の列

| 列 | 内容 |
|---|---|
| 受信日時 | 自動入力 |
| ソース | Gmail / LINE |
| 物件名〜担当者電話 | Claude が自動抽出 |
| ステータス | 検討中 / 見送り / 申込済み（手動更新） |
| メモ | 自由記入 |
