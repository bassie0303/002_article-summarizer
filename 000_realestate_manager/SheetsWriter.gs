// ============================================================
// Google Sheets — 読み書き
// ============================================================

function getSheet() {
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    _initSheet(sheet);
  }
  return sheet;
}

function _initSheet(sheet) {
  sheet.appendRow(COLUMNS);
  var hdr = sheet.getRange(1, 1, 1, COLUMNS.length);
  hdr.setBackground('#1a73e8').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(3, 180);   // 物件名
  sheet.setColumnWidth(4, 160);   // 所在地
  sheet.setColumnWidth(9, 200);   // 受信メールURL
  sheet.setColumnWidth(15, 200);  // 物件URL
  sheet.setColumnWidth(16, 200);  // 資料URL
}

function isAlreadySaved(emailUrl) {
  if (!emailUrl) return false;
  var sheet = getSheet();
  var data  = sheet.getDataRange().getValues();
  var col   = COLUMNS.indexOf('受信メールURL') + 1; // 1-based
  for (var i = 1; i < data.length; i++) {
    if (data[i][col - 1] === emailUrl) return true;
  }
  return false;
}

function appendProperty(info, receivedAt, source) {
  var sheet = getSheet();
  sheet.appendRow([
    Utilities.formatDate(receivedAt || new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
    source      || 'Gmail',
    info['物件名']      || '',
    info['所在地']      || '',
    info['価格']        || '',
    info['利回り']      || '',
    info['築年数']      || '',
    info['建築年月']    || '',
    info['受信メールURL'] || '',
    info['土地面積']    || '',
    info['建物面積']    || '',
    info['年間収入']    || '',
    info['取扱業者']    || '',
    info['担当者名']    || '',
    info['物件URL']     || '',
    info['資料URL']     || '',
    info['担当者メアド'] || '',
    info['担当者電話']  || '',
    '検討中',
    ''
  ]);
}
