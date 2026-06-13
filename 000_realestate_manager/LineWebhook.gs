// ============================================================
// LINE Messaging API Webhook — メッセージを自動受信してSheetsへ保存
// ============================================================
//
// GAS の制約: doPost では HTTP ヘッダーが取得できないため、
// HMAC 署名検証の代わりに URL パラメータのシークレットで認証します。
// Webhook URL: https://script.google.com/macros/s/SCRIPT_ID/exec?secret=YOUR_SECRET

function handleLineWebhook(e) {
  var output = ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    // シークレット認証
    var secret = CONFIG.LINE_WEBHOOK_SECRET;
    if (secret && e.parameter.secret !== secret) {
      Logger.log('LINE Webhook: 認証失敗');
      return output;
    }

    var body = e.postData ? e.postData.contents : null;
    if (!body) return output;

    var json = JSON.parse(body);
    if (!json.events || json.events.length === 0) return output; // 接続確認用の空イベント

    json.events.forEach(function(event) {
      if (event.type === 'message' && event.message.type === 'text') {
        _processLineMessage(event);
      }
    });
  } catch (err) {
    Logger.log('LINE Webhook エラー: ' + err.toString());
  }

  return output;
}

function _processLineMessage(event) {
  var text       = event.message.text;
  var replyToken = event.replyToken;
  var receivedAt = new Date(event.timestamp);

  Logger.log('LINE受信: ' + text.slice(0, 120));

  var info = extractWithClaude(text);

  if (!info['物件名'] && !info['所在地'] && !info['価格']) {
    Logger.log('物件情報なし、スキップ');
    _replyToLine(replyToken, '物件情報が見つかりませんでした。\n不動産物件の情報を含むメッセージを送ってください。');
    return;
  }

  appendProperty(info, receivedAt, 'LINE');

  var name = info['物件名'] || info['所在地'] || '（名称不明）';
  Logger.log('保存: ' + name);
  _replyToLine(replyToken, '✅ スプレッドシートに保存しました\n物件名: ' + name);
}

function _replyToLine(replyToken, message) {
  var token = CONFIG.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: message }]
    }),
    muteHttpExceptions: true
  });
}
