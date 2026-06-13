// ============================================================
// エントリーポイント
// ============================================================

// 時間トリガーから呼び出される
function runAll() {
  processGmailEmails();
}

// Web App — LINE 入力フォームを返す（手動入力の補助用として残す）
function doGet() {
  return HtmlService.createHtmlOutputFromFile('webapp')
    .setTitle('不動産物件登録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// LINE Messaging API Webhook（LINE Bot へのメッセージを自動処理）
function doPost(e) {
  return handleLineWebhook(e);
}

// LINE フォームからの抽出リクエスト（クライアントから呼ばれる）
function extractLineInfo(text) {
  return extractWithClaude(text);
}

// LINE フォームからの保存リクエスト（クライアントから呼ばれる）
function saveLineProperty(info) {
  appendProperty(info, new Date(), 'LINE');
  return '保存しました';
}

// ── セットアップ用ユーティリティ ──────────────────────────

// 初回実行: シート初期化 + 時間トリガー登録
function setup() {
  // シート作成
  getSheet();

  // 既存トリガー削除
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runAll') ScriptApp.deleteTrigger(t);
  });

  // 30分おきトリガー
  ScriptApp.newTrigger('runAll')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('✅ セットアップ完了。30分おきに自動実行されます。');
}

// Gmail ラベルを作成（初回に手動実行）
function createGmailLabel() {
  var label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL)
            || GmailApp.createLabel(CONFIG.GMAIL_LABEL);
  Logger.log('ラベル作成: ' + label.getName());
}
