# 不動産トラッカー 引き継ぎ資料

## 概要
Gmail / LINE から不動産物件情報を自動取得して Google Sheets に蓄積するシステム。
Claude API で物件情報を構造化抽出する。

## リポジトリ
- **場所:** `/Users/yusuke/claude_test/realestate_tracker/`
- **種別:** Google Apps Script（GAS）— サーバーレス、デプロイ不要

## ファイル構成

| ファイル | 役割 |
|---|---|
| `Code.gs` | エントリーポイント。`doGet()`（手動フォーム）・`doPost()`（LINEwebhook） |
| `Config.gs` | ScriptPropertiesからAPIキー等を読み込む定数クラス |
| `GmailProcessor.gs` | Gmailの「不動産物件」ラベルを30分毎に処理 |
| `ClaudeAPI.gs` | Claude APIで物件情報をJSON抽出 |
| `SheetsWriter.gs` | スプレッドシートへの書き込み |
| `DriveHandler.gs` | 添付PDFをGoogle Driveに保存 |
| `LineWebhook.gs` | LINE Messaging API webhookの受信・返信 |
| `webapp.html` | 手動入力フォームのUI |

## 認証情報・APIキー

GASの「プロジェクトの設定」→「スクリプト プロパティ」に設定：

| プロパティ名 | 内容 |
|---|---|
| `CLAUDE_API_KEY` | Anthropic APIキー |
| `SHEET_ID` | Google SheetsのID |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEチャネルアクセストークン（長期） |
| `LINE_WEBHOOK_SECRET` | Webhook URL認証用の任意文字列 |

## データフロー

```
Gmail（不動産物件ラベル） ──→ GmailProcessor.gs
                                    ↓
LINE Bot（テキスト送信） ──→ LineWebhook.gs
                                    ↓
                             ClaudeAPI.gs（JSON抽出）
                                    ↓
                             SheetsWriter.gs（スプレッドシート書き込み）
```

## GAS WebアプリURL
LINE WebhookのURLは以下の形式：
```
https://script.google.com/macros/s/{SCRIPT_ID}/exec?secret={LINE_WEBHOOK_SECRET}
```

## 注意事項
- GASはデプロイのたびにSCRIPT_IDが変わる可能性がある。変わった場合はLINE DevelopersのWebhook URLも更新する。
- アクセス権は「全員（ANYONE_ANONYMOUS）」が必要（LINE webhookのため）
- Gmailトリガーは30分毎に自動実行（`setup()`関数で登録済み）

## Sheetsの列構成
受信日時 / ソース（Gmail or LINE） / 物件名 / 所在地 / 価格 / 面積 / 築年数 / 間取り / 担当者名 / 担当者電話 / ステータス / メモ
