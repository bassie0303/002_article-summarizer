// ============================================================
// Claude API — テキストから物件情報を抽出
// ============================================================

var EXTRACT_PROMPT = `以下のメール・メッセージから不動産投資物件の情報を抽出し、JSONのみ返してください。
情報がない項目は空文字列 "" にしてください。
金額・面積・利回りは単位ごとそのまま文字列で（例: "5,000万円" "7.5%" "120㎡"）。

必ず以下のキーのみを含むJSONを返してください:
{
  "物件名": "",
  "所在地": "",
  "価格": "",
  "利回り": "",
  "築年数": "",
  "建築年月": "",
  "土地面積": "",
  "建物面積": "",
  "年間収入": "",
  "取扱業者": "",
  "担当者名": "",
  "物件URL": "",
  "担当者メアド": "",
  "担当者電話": ""
}

--- テキスト ---
`;

function extractWithClaude(text) {
  var key = CONFIG.CLAUDE_API_KEY;
  if (!key) throw new Error('CLAUDE_API_KEY が未設定です');

  var body = {
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: EXTRACT_PROMPT + text.slice(0, 4000)
    }]
  };

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var data = JSON.parse(res.getContentText());
  if (!data.content || !data.content[0]) {
    throw new Error('Claude API エラー: ' + res.getContentText());
  }

  var raw = data.content[0].text.trim();
  var m = raw.match(/\{[\s\S]+\}/);
  if (!m) throw new Error('JSON が見つかりません: ' + raw);
  return JSON.parse(m[0]);
}
