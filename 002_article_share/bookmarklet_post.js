(function(){
  var Q='_sp';
  var ex=document.getElementById(Q);
  if(ex){ex.remove();return;}
  var u=location.href,ti=document.title,sel=(window.getSelection()||{}).toString().trim()||'';
  var p=document.createElement('div');
  p.id=Q;
  p.style.cssText='position:fixed;top:0;right:0;bottom:0;width:440px;max-width:100vw;background:#fff;box-shadow:-3px 0 16px rgba(0,0,0,.2);z-index:2147483647;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;font-family:sans-serif;font-size:13px';
  var IS='width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-size:12px';
  var TS=IS+';resize:vertical;line-height:1.5;overflow-wrap:break-word;word-break:break-word';
  p.innerHTML='<div style="background:#2d6a4f;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1"><b>✍️ 記事シェア（投稿版）</b><button id="'+Q+'z" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 4px">✕</button></div><div style="padding:12px"><p style="font-size:10px;color:#999;margin:0 0 8px;word-break:break-all">'+u.slice(0,80)+(u.length>80?'...':'')+'</p><label style="font-weight:700;font-size:12px;display:block;margin-bottom:2px">引用テキスト</label><p style="font-size:10px;color:#888;margin:0 0 3px">ページ上でテキストを選択してから開くと自動入力</p><textarea id="'+Q+'q" style="'+TS+';height:70px"></textarea><label style="font-weight:700;font-size:12px;display:block;margin:8px 0 2px">コメント</label><textarea id="'+Q+'c" style="'+TS+';height:55px" placeholder="コメントを入力..."></textarea><label style="font-weight:700;font-size:12px;display:block;margin:8px 0 2px">ハッシュタグ</label><p style="font-size:10px;color:#888;margin:0 0 3px">スペース区切りで複数入力（ページから自動候補）</p><input id="'+Q+'h" type="text" style="'+IS+'" placeholder="#tag1 #tag2"><button id="'+Q+'hb" style="margin-top:4px;padding:4px 10px;background:#2d6a4f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">🤖 AIで提案</button><label style="font-weight:700;font-size:12px;display:block;margin:8px 0 2px">🧵 Threadsトピック</label><p style="font-size:10px;color:#888;margin:0 0 3px">ハッシュタグではなくトピックカテゴリで投稿（英語カンマ区切り）</p><input id="'+Q+'tp" type="text" style="'+IS+'" placeholder="Technology, Travel, ..."><button id="'+Q+'tpb" style="margin-top:4px;padding:4px 10px;background:#2d6a4f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px">🤖 AIで提案</button><hr style="margin:10px 0;border:0;border-top:1px solid #eee"><div id="'+Q+'r"></div></div>';
  document.body.appendChild(p);
  document.getElementById(Q+'z').onclick=function(){p.remove();};
  var qEl=document.getElementById(Q+'q');
  qEl.value=sel;
  if(!sel){try{if(navigator.clipboard&&typeof navigator.clipboard.readText==='function'){navigator.clipboard.readText().then(function(txt){if(txt&&!qEl.value){qEl.value=txt.trim();upd();}}).catch(function(){});}}catch(e){}}
  function _xt(){var tags=[],seen={};var kw=document.querySelector('meta[name="keywords"]');if(kw&&kw.content){kw.content.split(/[,、]+/).forEach(function(t){t=t.trim().replace(/\s+/g,'').replace(/^#+/,'');if(t)tags.push(t);});}if(!tags.length){document.querySelectorAll('meta[property="article:tag"]').forEach(function(m){var t=m.content.trim().replace(/\s+/g,'').replace(/^#+/,'');if(t)tags.push(t);});}if(!tags.length){document.querySelectorAll('a[rel="tag"],a[href*="/hashtag/"],a[href*="/tag/"]').forEach(function(a){var t=(a.textContent||'').trim().replace(/^#+/,'').replace(/\s+/g,'');if(t&&t.length<=15)tags.push(t);});}var r=[];tags.forEach(function(t){if(!seen[t]){seen[t]=true;r.push(t);}});return r.slice(0,4).map(function(t){return'#'+t;}).join(' ');}
  var _initTags=_xt();if(_initTags)document.getElementById(Q+'h').value=_initTags;
  var pls=[{k:'x',l:'𝕏 X',m:280},{k:'f',l:'📘 Facebook',m:0},{k:'t',l:'🧵 Threads',m:500}];
  var rs=document.getElementById(Q+'r');
  pls.forEach(function(pl){var c=document.createElement('div');c.style.marginBottom='12px';c.innerHTML='<div style="background:#f5f5f5;padding:7px 12px;font-weight:700;font-size:13px;border:1px solid #ddd;border-radius:8px 8px 0 0">'+pl.l+'</div><div style="border:1px solid #ddd;border-top:0;border-radius:0 0 8px 8px;padding:10px"><textarea id="'+Q+pl.k+'" style="width:100%;height:90px;padding:5px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-size:11px;resize:vertical;line-height:1.5;overflow-wrap:break-word;word-break:break-word"></textarea><div id="'+Q+pl.k+'n" style="font-size:11px;margin:3px 0 6px"></div><div style="display:flex;gap:4px"><button data-k="'+pl.k+'" style="flex:1;padding:5px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;font-size:11px">📋 コピー</button><a id="'+Q+pl.k+'a" href="#" target="_blank" rel="noopener" style="flex:1;padding:5px;background:#2d6a4f;color:#fff;border-radius:3px;text-align:center;text-decoration:none;font-size:11px;display:flex;align-items:center;justify-content:center">シェア→</a></div></div>';rs.appendChild(c);});
  rs.querySelectorAll('[data-k]').forEach(function(btn){btn.onclick=function(){var ta=document.getElementById(Q+btn.dataset.k);navigator.clipboard&&navigator.clipboard.writeText(ta.value).then(function(){btn.textContent='✅';setTimeout(function(){btn.textContent='📋 コピー';},2000);});};});
  function fmt(mx){
    var cmt=document.getElementById(Q+'c').value.trim();
    var qt=document.getElementById(Q+'q').value.trim();
    var qlines=qt?qt.split('\n').map(function(l){return l?'> '+l:'>';}).join('\n'):'';
    if(mx===0){var r=[];if(cmt)r.push(cmt);if(qlines)r.push(qlines);return r.join('\n\n');}
    if(cmt&&qlines){if(cmt.length>=mx)return cmt.slice(0,mx);var sep='\n\n',rem=mx-cmt.length-sep.length;if(rem<=0)return cmt.slice(0,mx);return cmt+sep+qlines.slice(0,rem);}
    if(cmt)return cmt.slice(0,mx);
    if(qlines)return qlines.slice(0,mx);
    return'';
  }
  function join(body,sfx){return body?body+'\n\n'+sfx:sfx;}
  function upd(){
    var enc=encodeURIComponent;
    var ht=document.getElementById(Q+'h').value.trim();
    var tp=document.getElementById(Q+'tp').value.trim();
    var xULen=Math.min(u.length,23);
    var xSfx=u+(ht?'\n'+ht:'');
    var xSfLen=xSfx.length-u.length+xULen;
    var xBodyMax=280-xSfLen-2;
    var xBody=fmt(Math.max(0,xBodyMax));
    var xF=join(xBody,xSfx);
    var tiShort=ti?ti.slice(0,60)+(ti.length>60?'…':''):'';
    var thSfx=(tiShort?tiShort+'\n':'')+u;
    var thBodyMax=500-thSfx.length-2;
    var thBody=fmt(Math.max(0,thBodyMax));
    var thF=join(thBody,thSfx);
    var fbBody=fmt(0);
    var fbSfx=(ti?ti+'\n':'')+u+(ht?'\n'+ht:'');
    var fbF=join(fbBody,fbSfx);
    var vals={x:xF,f:fbF,t:thF};
    var lims={x:280,f:0,t:500};
    document.getElementById(Q+'xa').href='https://twitter.com/intent/tweet?text='+enc(xF);
    document.getElementById(Q+'fa').href='https://www.facebook.com/sharer/sharer.php?u='+enc(u);
    document.getElementById(Q+'ta').href='https://www.threads.net/intent/post?text='+enc(thF)+(tp?'&topic_names='+enc(tp):'');
    ['x','f','t'].forEach(function(k){
      document.getElementById(Q+k).value=vals[k];
      var lm=lims[k];
      var cnt=k==='x'?xF.length-u.length+xULen:vals[k].length;
      var ov=lm>0&&cnt>lm;
      document.getElementById(Q+k+'n').innerHTML='<span style="color:'+(ov?'#dc2626':'#16a34a')+'">'+(ov?'🔴':'🟢')+' '+(lm?cnt+'/'+lm:cnt+'字')+'</span>';
    });
  }
  document.getElementById(Q+'c').addEventListener('input',upd);
  document.getElementById(Q+'q').addEventListener('input',upd);
  document.getElementById(Q+'h').addEventListener('input',upd);
  document.getElementById(Q+'tp').addEventListener('input',upd);
  async function aiSuggest(prompt,targetId,btn){
    var k=localStorage.getItem('_gemk');
    if(!k){k=window.prompt('Google AI Studio APIキー(AIzaSy...)を入力してください');if(!k)return;localStorage.setItem('_gemk',k);}
    btn.disabled=true;btn.textContent='生成中...';
    var tx='';
    ['article','main','.post-content','.entry-content'].some(function(s){var e=document.querySelector(s);if(e&&e.innerText.length>100){tx=e.innerText.slice(0,800);return true;}});
    if(!tx)tx=document.body.innerText.slice(0,800);
    try{
      var r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+k,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt+'\nタイトル:'+ti+'\n本文:'+tx}]}],generationConfig:{maxOutputTokens:80}})});
      if(!r.ok)throw new Error('HTTP '+r.status);
      var d=await r.json();
      document.getElementById(targetId).value=d.candidates[0].content.parts[0].text.trim();
      upd();
    }catch(e){alert('失敗: '+e.message);}
    btn.disabled=false;btn.textContent='🤖 AIで提案';
  }
  document.getElementById(Q+'hb').onclick=function(){aiSuggest('以下の記事に適したハッシュタグを2～4個、スペース区切りのみで出力。#付き、説明不要。',Q+'h',this);};
  document.getElementById(Q+'tpb').onclick=function(){aiSuggest('以下の記事に最も適したThreadsのトピックカテゴリを1～3個、英語カンマ区切りのみで出力。例:Technology,Travel,Food 説明不要。',Q+'tp',this);};
  upd();
})();
