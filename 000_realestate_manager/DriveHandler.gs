// ============================================================
// Google Drive — 添付ファイル保存
// ============================================================

function getDriveFolder() {
  var iter = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  return iter.hasNext() ? iter.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function saveAttachments(message) {
  var attachments = message.getAttachments();
  if (!attachments.length) return '';

  var folder  = getDriveFolder();
  var dateStr = Utilities.formatDate(message.getDate(), 'Asia/Tokyo', 'yyyyMMdd');
  var urls    = [];

  attachments.forEach(function(att) {
    var ct = att.getContentType() || '';
    if (!ct.match(/pdf|image|jpeg|png/i)) return;

    var name = dateStr + '_' + att.getName().replace(/[\/\\:*?"<>|]/g, '_');
    try {
      var file = folder.createFile(att.copyBlob().setName(name));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urls.push(file.getUrl());
    } catch(e) {
      Logger.log('添付保存エラー: ' + e.toString());
    }
  });

  return urls.join('\n');
}
