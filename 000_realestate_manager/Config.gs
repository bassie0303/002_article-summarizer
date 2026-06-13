// ============================================================
// 設定ファイル — Script Properties に値をセットしてください
// ============================================================
var CONFIG = {
  get CLAUDE_API_KEY() {
    return PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || '';
  },
  get SHEET_ID() {
    return PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '';
  },
  get LINE_CHANNEL_ACCESS_TOKEN() {
    return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  },
  // Webhook URL に ?secret=xxx として付与するシークレット（LINE Webhook の簡易認証）
  get LINE_WEBHOOK_SECRET() {
    return PropertiesService.getScriptProperties().getProperty('LINE_WEBHOOK_SECRET') || '';
  },
  get GEMINI_API_KEY() {
    return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  },
  SHEET_NAME:        '物件一覧',
  DRIVE_FOLDER_NAME: '不動産資料',
  PROCESSED_LABEL:   '物件処理済み',

  GMAIL_LABEL: '不動産物件',
  GMAIL_KEYWORDS: 'subject:(物件 OR 不動産 OR 利回り OR 収益 OR 売買)',

  MAX_THREADS: 30,
};

// Sheets の列定義（順番を変えないこと）
var COLUMNS = [
  '受信日時', 'ソース', '物件名', '所在地', '価格', '利回り',
  '築年数', '建築年月', '受信メールURL', '土地面積', '建物面積',
  '年間収入', '取扱業者', '担当者名', '物件URL', '資料URL',
  '担当者メアド', '担当者電話', 'ステータス', 'メモ'
];
