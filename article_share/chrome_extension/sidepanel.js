const SYSTEM_PROMPT = (xAv, thAv) =>
  `あなたはSNSマーケティングの専門家です。必ずJSON形式のみで回答し、マークダウン・説明文・コードブロックは一切出力しないでください。X:${xAv}字以内+ハッシュタグ2-3個（文字数が足りない場合はタイトルのみや一言でも可）、Facebook:詳しく絵文字可、Threads:${thAv}字以内カジュアル（文字数が足りない場合はタイトルのみや一言でも可）。`;

const USER_PROMPT = (title, text) =>
  `以下の記事を各SNS向けに要約し、次のJSONフォーマットのみで返してください。JSON以外は絶対に出力しないでください。\n{"x":"X用テキスト","facebook":"Facebook用テキスト","threads":"Threads用テキスト"}\n\nタイトル:${title}\n本文:\n${text}`;

function showStatus(type, msg) {
  const bg = { info: '#eef2ff', error: '#fdf2f2', success: '#f0faf0' };
  const color = { info: '#1e1b4b', error: '#991b1b', success: '#14532d' };
  document.getElementById('status').innerHTML =
    `<div style="padding:10px;background:${bg[type]};color:${color[type]};border-radius:6px;font-size:13px;margin-top:8px">${msg}</div>`;
}

function parseJson(raw) {
  const j0 = raw.indexOf('{');
  const j1 = raw.lastIndexOf('}');
  if (j0 < 0 || j1 < 0) throw new Error(`JSONが見つかりません。Claude応答:「${raw.slice(0, 120)}」`);
  const fixed = raw.slice(j0, j1 + 1).replace(
    /("(?:[^"\\]|\\.|[\n\r])*")/g,
    m => m.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  );
  return JSON.parse(fixed);
}

function showResults(texts, url) {
  const enc = encodeURIComponent;
  const links = {
    x: `https://twitter.com/intent/tweet?text=${enc(texts.x)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    threads: `https://www.threads.net/intent/post?text=${enc(texts.threads)}`
  };
  const platforms = [
    { k: 'x',        label: '𝕏 X (Twitter)', limit: 280,  shareLabel: '𝕏 でシェア',          link: links.x },
    { k: 'facebook', label: '📘 Facebook',    limit: null, shareLabel: '📘 Facebook でシェア', link: links.facebook },
    { k: 'threads',  label: '🧵 Threads',     limit: 500,  shareLabel: '🧵 Threads でシェア',  link: links.threads }
  ];

  const resultsEl = document.getElementById('results');
  const hr = document.createElement('hr');
  hr.className = 'divider';
  resultsEl.innerHTML = '';
  resultsEl.appendChild(hr);

  platforms.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';

    const head = document.createElement('div');
    head.className = 'card-head';
    head.textContent = p.label;

    const body = document.createElement('div');
    body.className = 'card-body';

    const ta = document.createElement('textarea');
    ta.className = 'ta';
    ta.value = texts[p.k];

    const countEl = document.createElement('div');
    countEl.className = 'count';

    const updateCount = () => {
      const cnt = ta.value.length;
      const over = p.limit && cnt > p.limit;
      countEl.style.color = over ? '#dc2626' : '#16a34a';
      countEl.textContent = `${over ? '🔴' : '🟢'} ${p.limit ? `${cnt} / ${p.limit}` : `${cnt} 字`}`;
    };
    updateCount();
    ta.addEventListener('input', updateCount);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '📋 コピー';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(ta.value).then(() => {
        copyBtn.textContent = '✅ コピー済み';
        setTimeout(() => { copyBtn.textContent = '📋 コピー'; }, 2000);
      });
    });

    const shareA = document.createElement('a');
    shareA.className = 'share-btn';
    shareA.href = p.link;
    shareA.target = '_blank';
    shareA.rel = 'noopener';
    shareA.textContent = `${p.shareLabel} →`;

    btnRow.append(copyBtn, shareA);
    body.append(ta, countEl, btnRow);
    card.append(head, body);
    resultsEl.appendChild(card);
  });
}

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', async () => {
  // 保存済みAPIキー読み込み
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) {
    document.getElementById('api-key').value = apiKey;
    document.getElementById('save-key').checked = true;
  }

  // 現在タブのURL表示
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('url-display').textContent = tab.url;

  // 閉じるボタン
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  // 生成ボタン
  document.getElementById('generate-btn').addEventListener('click', async () => {
    const key = document.getElementById('api-key').value.trim();
    if (!key) { showStatus('error', '⚠️ APIキーを入力してください'); return; }

    if (document.getElementById('save-key').checked) {
      await chrome.storage.local.set({ apiKey: key });
    } else {
      await chrome.storage.local.remove('apiKey');
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    document.getElementById('results').innerHTML = '';
    showStatus('info', '🔍 ページを解析中...');

    let url, title, text;
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      url = currentTab.url;
      title = currentTab.title;

      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          const sels = ['article', 'main', '[role=main]', '.post-content', '.article-body', '.entry-content', '#main-content', '#content'];
          for (const s of sels) {
            const el = document.querySelector(s);
            if (el && el.innerText.length > 100) return el.innerText.slice(0, 3500);
          }
          return document.body.innerText.slice(0, 3500);
        }
      });
      text = results[0].result;
    } catch (e) {
      showStatus('error', `❌ ページ読み取りエラー: ${e.message}<br><small>chrome://やPDFページでは動作しません</small>`);
      btn.disabled = false;
      return;
    }

    const xAv = Math.max(20, 267 - url.length);
    const thAv = Math.max(20, 487 - url.length);

    showStatus('info', '🤖 Claudeが要約を生成中...');

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: [{ type: 'text', text: SYSTEM_PROMPT(xAv, thAv), cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: USER_PROMPT(title, text) }]
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error((err.error && err.error.message) || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const texts = parseJson(data.content[0].text);

      texts.x        = `AIで生成：試験運用中\n${texts.x.slice(0, xAv)}\n${url}`;
      texts.facebook  = `AIで生成：試験運用中\n${texts.facebook}`;
      texts.threads   = `AIで生成：試験運用中\n${texts.threads.slice(0, thAv)}\n${url}`;

      showStatus('success', '✅ 完成！テキストは編集できます。');
      showResults(texts, url);
    } catch (e) {
      showStatus('error', `❌ ${e.message}`);
    }

    btn.disabled = false;
  });
});
