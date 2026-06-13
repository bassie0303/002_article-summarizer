// ============================================================
// Gmail 処理 — ラベルまたはキーワードで未読メールを抽出
// ============================================================

function processGmailEmails() {
  var threads = _getTargetThreads();
  Logger.log('対象スレッド数: ' + threads.length);

  var processed = 0;
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!msg.isUnread()) return;
      try {
        _processMessage(msg);
        processed++;
      } catch(e) {
        Logger.log('メッセージ処理エラー [' + msg.getSubject() + ']: ' + e.toString());
      }
    });
  });

  Logger.log('処理完了: ' + processed + ' 件');
}

function _getTargetThreads() {
  var processedLabelName = CONFIG.PROCESSED_LABEL;

  if (CONFIG.GMAIL_LABEL) {
    var label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
    if (label) {
      return label.getThreads(0, CONFIG.MAX_THREADS);
    }
    Logger.log('ラベル「' + CONFIG.GMAIL_LABEL + '」が見つかりません。キーワード検索に切り替えます。');
  }

  var query = CONFIG.GMAIL_KEYWORDS + ' is:unread -label:' + processedLabelName;
  return GmailApp.search(query, 0, CONFIG.MAX_THREADS);
}

function _processMessage(msg) {
  var emailUrl = 'https://mail.google.com/mail/u/0/#inbox/' + msg.getId();

  // 重複チェック
  if (isAlreadySaved(emailUrl)) {
    msg.markRead();
    return;
  }

  var body       = msg.getPlainBody();
  var subject    = msg.getSubject();
  var driveUrls  = saveAttachments(msg);

  var text = '件名: ' + subject + '\n\n' + body;
  var info = extractWithClaude(text);

  // 物件名が空なら不動産メールではないと判断してスキップ
  if (!info['物件名'] && !info['所在地'] && !info['価格']) {
    Logger.log('物件情報なし、スキップ: ' + subject);
    msg.markRead();
    return;
  }

  info['受信メールURL'] = emailUrl;
  if (driveUrls) info['資料URL'] = driveUrls;

  appendProperty(info, msg.getDate(), 'Gmail');
  msg.markRead();

  var pl = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL)
         || GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  msg.getThread().addLabel(pl);

  Logger.log('保存: ' + (info['物件名'] || subject));
}
