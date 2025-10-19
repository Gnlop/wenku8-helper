// ==UserScript==
// @name         Wenku8-helper
// @namespace    https://wenku8-helper.local
// @version      4.5.7
// @description  一条龙
// @author       you
// @match        https://www.wenku8.net/book/*.htm
// @match        https://www.wenku8.net/novel/*/*/index.htm
// @match        https://www.wenku8.net/novel/*/*/*.htm
// @icon         https://www.wenku8.net/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      dl.wenku8.com
// @connect      dl1.wenku8.com
// @connect      www.wenku8.net
// @connect      pic.wenku8.com
// @connect      img.wenku8.com
// @connect      i.wkcdn.net
// @connect      pic.777743.xyz
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  /* ================= 配置 ================= */
  const CFG = {
    DEBUG: false,
    TIMEOUT: 30000,
    DL_HOSTS: ['https://dl.wenku8.com', 'https://dl1.wenku8.com'],
    TOAST_MS: 4200,
    WHOLE_MIN_LEN: 2000,
    CHAP_MIN_LEN: 80,
    LS_KEY: 'wk_reader_pref_chapter_v3'
  };

  const log = (...a)=>CFG.DEBUG && console.log('[Wenku8Helper]', ...a);
  const warn = (...a)=>console.warn('[Wenku8Helper]', ...a);
  const err  = (...a)=>console.error('[Wenku8Helper]', ...a);
  const sleep = ms=>new Promise(r=>setTimeout(r, ms));

  /* ================= 偏好 ================= */
  const defaultPref = { theme:'dark', fontPx:18, lineH:1.9, maxW:1000 };
  const loadPref = ()=>{ try{ return {...defaultPref, ...(JSON.parse(localStorage.getItem(CFG.LS_KEY)||'{}'))}; }catch(e){ return {...defaultPref}; } };
  const savePref = p=>{ try{ localStorage.setItem(CFG.LS_KEY, JSON.stringify(p)); }catch(e){} };

  /* ================= 工具 ================= */
  function toast(msg, type='info', ms=CFG.TOAST_MS) {
    const id='__wk_toast__'; let box=document.getElementById(id);
    if(!box){
      box=document.createElement('div'); box.id=id;
      box.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none';
      document.body.appendChild(box);
    }
    const bg= type==='error' ? '#ef4444' : type==='success' ? '#2563eb' : '#3c3f44';
    const d=document.createElement('div');
    d.style.cssText='pointer-events:auto;padding:10px 14px;color:#fff;background:' + bg + ';border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13px;max-width:600px';
    d.textContent=msg; box.appendChild(d); setTimeout(()=>{ try{ d.remove(); }catch(e){} }, ms);
  }

  // 文本请求（带 Cookie/Referer 轮询）
  function gmFetchText(url, {encoding='utf-8', timeout=CFG.TIMEOUT, referers}={}) {
    const idxEl = document.getElementById('btnIndex');
    const refList = (referers && referers.length ? referers : [
      idxEl ? idxEl.getAttribute('href') : '',
      'https://www.wenku8.net/',
      'https://pic.777743.xyz/'
    ]).filter(Boolean);
    let idx = 0;
    return new Promise((resolve,reject)=>{
      const tryOnce = ()=>{
        GM_xmlhttpRequest({
          method:'GET',
          url,
          timeout,
          responseType:'arraybuffer',
          withCredentials:true,
          headers:{
            'Referer': refList[Math.min(idx, refList.length-1)],
            'Origin': 'https://www.wenku8.net',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': navigator.language || 'zh-CN,zh;q=0.9'
          },
          onload: res=>{
            if (res.status < 200 || res.status >= 300) {
              if (idx < refList.length - 1){ idx++; tryOnce(); return; }
              reject(new Error('HTTP ' + res.status)); return;
            }
            try{
              const dec=new TextDecoder(encoding, {fatal:false});
              resolve(dec.decode(res.response));
            }catch(e){ reject(e); }
          },
          onerror: ()=>{ if (idx < refList.length - 1){ idx++; tryOnce(); } else reject(new Error('Network error')); },
          ontimeout: ()=>{ if (idx < refList.length - 1){ idx++; tryOnce(); } else reject(new Error('Timeout')); },
        });
      };
      tryOnce();
    });
  }

  // 文本下载
  function downloadText(name, text){
    const blob=new Blob([text],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    let cleaned=false;
    const cleanup=()=>{ if(!cleaned){ cleaned=true; setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(e){} }, 30000); } };
    const anchorFallback = ()=>{
      try{
        const a=document.createElement('a');
        a.href=url; a.download=name; a.rel='noopener'; a.style.display='none';
        document.body.appendChild(a); a.click(); setTimeout(()=>{ try{ a.remove(); }catch(e){} },0);
      }finally{ cleanup(); }
    };
    try{
      if (typeof GM_download==='function'){
        GM_download({ url, name, saveAs:false, onload: cleanup, onerror: anchorFallback, ontimeout: anchorFallback });
      }else anchorFallback();
    }catch(e){ anchorFallback(); }
  }

  // 粗判整书 TXT
  function isLikelyBookTxt(s){
    if(!s) return false;
    if (/<\/?(?:script|meta|iframe|body\s*onload)/i.test(s)) return false;
    return s.replace(/\s/g,'').length >= CFG.WHOLE_MIN_LEN;
  }

  const addBtn=(where, text, onclick)=>{
    const btn=document.createElement('button');
    btn.textContent=text; btn.className='wk-btn';
    btn.addEventListener('click', async e=>{
      e.preventDefault(); e.stopPropagation();
      if(btn.disabled) return;
      const old=btn.textContent; btn.disabled=true; btn.textContent='处理中…';
      try{ await onclick(); btn.textContent='完成 ✔'; toast('完成','success'); }
      catch(ex){ btn.textContent='失败 ✖'; toast(ex.message||'操作失败','error'); err(ex); }
      finally{ await sleep(900); btn.textContent=old; btn.disabled=false; }
    });
    where.prepend(btn); return btn;
  };

  // 统一图片域名
  function normalizeImageHost(u){
    try{
      if(!/^https?:\/\//i.test(u)) return u;
      const url = new URL(u);
      if (url.hostname.toLowerCase() === 'pic.wenku8.com') { url.hostname = 'pic.777743.xyz'; return url.toString(); }
    }catch(e){}
    return u;
  }

  // 提取插图链接（供阅读器&预览）
  function extractAndSortImages(raw) {
    if (!raw) return [];
    const out = new Set();
    const pushIfImg = (u) => {
      u = normalizeImageHost(u);
      if (!u) return;
      u = u.replace(/&amp;/g, '&').trim();
      if (/^https?:\/\//i.test(u) && /\.(?:jpe?g|png|gif|webp|bmp)(?:[?#].*)?$/i.test(u)) out.add(u);
    };

    let doc=null; try { doc = new DOMParser().parseFromString(raw, 'text/html'); } catch(e){}
    if (doc) {
      Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), a => pushIfImg(a.getAttribute('href')));
      Array.prototype.forEach.call(doc.querySelectorAll('[title]'), el => pushIfImg(el.getAttribute('title')));
      Array.prototype.forEach.call(doc.querySelectorAll('[onclick]'), el => {
        const s = el.getAttribute('onclick') || '';
        let m; const re = /imgclickshow\(\s*(?:"[^"]*"|'[^']*')\s*,\s*(?:"([^"]+)"|'([^']+)')\s*\)/gi;
        while ((m = re.exec(s)) !== null) pushIfImg(m[1] || m[2]);
      });
      Array.prototype.forEach.call(doc.querySelectorAll('a'), a => pushIfImg(a.textContent || ''));
    }

    const reTxt = /(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|gif|webp|bmp))(?:[?#][^\s"'<>]*)?/gi;
    let m2; while ((m2 = reTxt.exec(raw)) !== null) pushIfImg(m2[1]);

    const arr = Array.from(out);
    const num = (u) => {
      const mm1 = u.match(/(\d+)(?=\.[a-z]+(?:[?#]|$))/i);
      if (mm1) return +mm1[1];
      const mm2 = u.match(/(\d+)/g);
      return mm2 ? +mm2[mm2.length - 1] : Number.POSITIVE_INFINITY;
    };
    arr.sort((a,b)=> (num(a)-num(b)) || a.localeCompare(b));
    return arr;
  }

  function txtToHtml(txt) {
    if (!txt) return '';
    txt = txt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const blocks = txt.split(/\n{2,}/);
    return blocks.map(block => {
      const lines = block.split(/\n/);
      const safe = lines.map(l => l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('<br>');
      return '<p>' + safe + '</p>';
    }).join('\n');
  }

  /* ============ 目录解析 ============ */
  async function parseIndexVolumes(indexURL){
    const html = await gmFetchText(indexURL, { encoding: 'gb18030' });
    let doc=null; try{ doc=new DOMParser().parseFromString(html, 'text/html'); }catch(e){}
    if(!doc) throw new Error('目录页面解析失败');
    const volumes = [];

    const tables = Array.from(doc.querySelectorAll('#content table'));
    if (tables.length) {
      for (const tb of tables) {
        const prev = tb.previousElementSibling;
        const title = (prev ? prev.textContent : '').replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const vol = { title, cid: 0, chapters: [] };
        const links = Array.from(tb.querySelectorAll('a[href$=".htm"]'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/(\d+)\.htm$/);
          if (!m) continue;
          const cid = +m[1];
          const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
          if (/插图|插圖/.test(t)) vol.chapters.push({ title: '插图', cid: vol.cid });
          else{ vol.chapters.push({ title: t, cid }); if (!vol.cid && cid) vol.cid = cid; }
        }
        if (vol.chapters.length) volumes.push(vol);
      }
    } else {
      const trs = Array.from(doc.querySelectorAll('tr'));
      let current = null;
      for (const tr of trs) {
        const head = tr.querySelector('td.vcss[vid]');
        if (head) {
          if (current) volumes.push(current);
          current = { title: (head.textContent||'').replace(/\s+/g,' ').trim(), cid: +(head.getAttribute('vid')||0), chapters:[] };
          continue;
        }
        if (!current) continue;
        const links = Array.from(tr.querySelectorAll('a[href$=".htm"]'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/(\d+)\.htm$/); if (!m) continue;
          const cid = +m[1];
          const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
          if (/插图|插圖/.test(t)) current.chapters.push({ title: '插图', cid: current.cid });
          else current.chapters.push({ title: t, cid });
        }
      }
      if (current) volumes.push(current);
    }
    if (!volumes.length) throw new Error('未解析到卷信息（可能未登录或目录结构变化）');
    return volumes;
  }

  const locateCurrentVolume=(vols, cidNow)=>{
    if (cidNow!=null){
      let i=vols.findIndex(v=>v.cid===cidNow); if(i!==-1) return i;
      i=vols.findIndex(v=>v.chapters.some(c=>c.cid===cidNow)); if(i!==-1) return i;
      let fb=0; for(let k=0;k<vols.length;k++){ if(vols[k].cid<=cidNow) fb=k; } return fb;
    }
    return 0;
  };

  // ============ 插图抓取（与在线阅读一致） ============
  async function fetchPackImagesByVol(aid, volCid) {
    const candidates = [];
    for (const host of CFG.DL_HOSTS) candidates.push(host + '/pack.php?aid=' + aid + '&vid=' + volCid);
    for (const host of CFG.DL_HOSTS) candidates.push(host + '/pack.php?aid=' + aid + '&vid=0', host + '/pack.php?aid=' + aid);
    const encs = ['gb18030', 'utf-8'];
    for (const url of candidates) {
      for (const enc of encs) {
        try {
          const raw = await gmFetchText(url, { encoding: enc });
          const urls = extractAndSortImages(raw);
          if (urls.length) return urls;
        } catch(e){}
      }
    }
    return [];
  }

  /* ============ 整卷文本抓取（packtxt.php） ============ */
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function buildTitleRegex(title){
    const flexible = esc(title).replace(/\s+/g, '[\\s\\u3000]*');
    return new RegExp('(^|\\n)\\s*' + flexible + '\\s*(\\r?\\n|$)', 'gm');
  }
  function splitVolumeByTitles(volRaw, chapters){
    const text = (volRaw||'').replace(/\r\n/g, '\n');
    const positions = [];
    let searchFrom = 0;
    for (let i=0;i<chapters.length;i++){
      const t = (chapters[i].title || '').trim();
      const re = buildTitleRegex(t);
      re.lastIndex = searchFrom;
      const m = re.exec(text);
      if(!m){
        const idx = text.indexOf(t, searchFrom);
        if (idx !== -1){
          const lineStart = text.lastIndexOf('\n', idx-1) + 1;
          positions.push({ idx: i, start: lineStart });
          searchFrom = idx + t.length;
        }else positions.push({ idx: i, start: -1 });
      }else{
        const lineStart = m.index + (m[1] ? m[1].length : 0);
        positions.push({ idx: i, start: lineStart });
        searchFrom = m.index + m[0].length;
      }
    }
    const out = new Array(chapters.length).fill('');
    const found = positions.filter(p=>p.start>=0).sort((a,b)=>a.start-b.start);
    for (let k=0;k<found.length;k++){
      const cur = found[k], next = found[k+1];
      const from = cur.start, to = next ? next.start : text.length;
      out[cur.idx] = text.slice(from, to).trim();
    }
    return out;
  }

  async function fetchWholeVolumeText(aid, vol) {
    const chapters = (vol && Array.isArray(vol.chapters)) ? vol.chapters.filter(c => c.cid !== vol.cid) : [];
    const firstCid = chapters.length ? chapters[0].cid : null;

    const vidCandidates = [];
    if (vol && vol.cid != null) vidCandidates.push(vol.cid);
    if (firstCid != null) vidCandidates.push(firstCid);
    vidCandidates.push(0);

    const uniqueCandidates = [...new Set(vidCandidates.filter(v => v != null))];
    const charsets = [{ q: 'gbk', enc: 'gb18030' }, { q: 'utf-8', enc: 'utf-8' }];

    for (const host of CFG.DL_HOSTS) {
      for (const vid of uniqueCandidates) {
        for (const cs of charsets) {
          const url = `${host}/packtxt.php?aid=${aid}&vid=${vid}&charset=${cs.q}`;
          try {
            const t = await gmFetchText(url, { encoding: cs.enc });
            if (t && /\S/.test(t) && t.replace(/\s/g, '').length >= CFG.CHAP_MIN_LEN) return t;
          } catch(e){}
        }
      }
    }
    return '';
  }

  /* ============ UI骨架 / 阅读流程 ============ */
  function mountReaderSkeleton(titleText, pref){
    try{ window.scrollTo(0,0); }catch(e){}
    const dyn = document.createElement('style'); dyn.id='wk-dyn';
    dyn.textContent = ':root{--fpx:'+pref.fontPx+';--lh:'+pref.lineH+';--maxw:'+pref.maxW+'px;--h1scale:1.2;--h2scale:1.1;}';
    document.head.appendChild(dyn);

    document.body.innerHTML = /* html */`
<style id="wk-style">
:root{--bg:#0b0e14;--fg:#e6e6e6;--muted:#9aa6b2;--card:#121826;--primary:#7aa2ff;--border:#222838;--shadow:0 8px 30px rgba(0,0,0,.35);--font-stack:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:calc(var(--fpx)*1px)/var(--lh) var(--font-stack);}
a{color:var(--primary);text-decoration:none}
header{position:sticky;top:0;background:rgba(12,14,20,.78);backdrop-filter:saturate(180%) blur(10px);z-index:10;border-bottom:1px solid var(--border)}
.bar{max-width:var(--maxw);margin:0 auto;padding:10px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wk-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:12px;background:#1a2235;color:#e6e6e6;cursor:pointer;border:0;user-select:none;transition:transform .02s ease}
.wk-btn:hover{background:#22304b}.wk-btn:active{transform:translateY(1px)}
.wrap{max-width:var(--maxw);margin:18px auto;padding:0 16px}
h1{font-size:calc(var(--fpx)*var(--h1scale)*1px);margin:10px 0 12px}
.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:14px}
.hidden{display:none}.sep{height:1px;background:var(--border);margin:14px 0}
#chapterBox{background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px}
#sideTOC{position:fixed;left:0;top:52px;bottom:0;width:280px;padding:12px;border-right:1px solid var(--border);background:rgba(12,14,20,.78);backdrop-filter:saturate(180%) blur(10px);overflow:auto;display:none;z-index:20}
#sideTOC.open{display:block}#sideTOC h4{margin:4px 0 10px;font-size:13px;color:var(--muted)}
#sideTOC a{display:block;padding:6px 10px;border-radius:8px;color:#cbd5e1}#sideTOC a:hover{background:#1b2234}#sideTOC a.active{background:#22304b;color:#fff}
#progressBar{position:fixed;left:0;top:0;height:3px;background:linear-gradient(90deg,#60a5fa,#a78bfa);width:0;z-index:30}
html.light{--bg:#f6f7fb;--fg:#1a1d29;--muted:#667085;--card:#ffffff;--border:#e5e7ef;--primary:#3366ff;--shadow:0 8px 30px rgba(16,24,40,.06)}
html.light header{background:rgba(255,255,255,.82)}html.light .wk-btn{background:#eef2ff;color:#16203a;border:1px solid #dbe4ff}.light .wk-btn:hover{background:#e6ecff}
#sideTOC .toc-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px}
.wk-btn.tiny{padding:4px 8px;font-size:12px;border-radius:8px}
#btnTocExpand{position:fixed;left:12px;top:60px;z-index:21;display:none}
</style>
<div id="progressBar"></div>
<header>
  <div class="bar">
    <button class="wk-btn" id="btnBackSel">⟵ 卷列表</button>
    <button class="wk-btn" id="btnPrevVol">◀ 上一卷</button>
    <button class="wk-btn" id="btnNextVol">下一卷 ▶</button>
    <button class="wk-btn" id="btnPrevChap">⬅ 上一章</button>
    <button class="wk-btn" id="btnNextChap">下一章 ➡</button>
    <button class="wk-btn" id="btnDownChap">↓ 本章TXT</button>
    <button class="wk-btn" id="btnDownVol">⇩ 本卷TXT</button>
    <button class="wk-btn" id="btnImages">🖼 插图</button>
    <div style="flex:1"></div>
    <div id="prefBar" style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted)">
      <label>字号 <input type="range" id="rngFont" min="14" max="24"></label>
      <label>行距 <input type="range" id="rngLine" min="14" max="22"></label>
      <label>栏宽 <input type="range" id="rngWidth" min="680" max="1200"></label>
      <button class="wk-btn" id="btnTheme">🌓 主题</button>
      <span id="progress" style="margin-left:4px"></span>
    </div>
    <a class="wk-btn" id="btnIndex" target="_blank" rel="noopener">☰ 原目录</a>
  </div>
</header>

<nav id="sideTOC" aria-label="章节目录">
  <div class="toc-head">
    <h4>本卷章节</h4>
    <button class="wk-btn tiny" id="btnTocCollapse">收起</button>
  </div>
  <div id="tocLinks"></div>
</nav>
<button class="wk-btn tiny" id="btnTocExpand" title="展开目录">展开</button>

<div class="wrap">
  <h1 id="pageTitle"></h1>
  <div id="viewSelect">
    <div class="muted" style="margin-bottom:8px">请选择要开始阅读的卷：</div>
    <div id="volList" class="card"></div>
  </div>
  <div id="viewReader" class="hidden">
    <h1 id="volTitle">（未选择）</h1>
    <div id="chapterBox">
      <h2 id="chapTitle" style="margin-top:0"></h2>
      <div id="textArea"><p class="muted">（未加载）</p></div>
    </div>
    <div class="sep"></div>
    <div id="imagesSection" class="hidden">
      <h1>插图</h1>
      <div id="imgGrid" class="card" style="padding:10px"></div>
    </div>
  </div>
</div>`;
    // 应用初始偏好
    const rngFont=document.getElementById('rngFont');
    const rngLine=document.getElementById('rngLine');
    const rngWidth=document.getElementById('rngWidth');
    rngFont.value = pref.fontPx;
    rngLine.value = Math.round(pref.lineH*10);
    rngWidth.value = pref.maxW;
    document.documentElement.classList.toggle('light', pref.theme==='light');
    document.getElementById('pageTitle').textContent = titleText;
  }

  const setDocTitle=t=>document.title = t + ' - 在线阅读（按章）';
  const setPageTitle=t=>{ const h=document.getElementById('pageTitle'); if(h) h.textContent=t; };
  const setVolTitle=t=>{ const h=document.getElementById('volTitle'); if(h) h.textContent=t; };
  const setChapTitle=t=>{ const h=document.getElementById('chapTitle'); if(h) h.textContent=t; };
  const setProgressText=s=>{ const el=document.getElementById('progress'); if(el) el.textContent=s||''; };
  function showSelectView(flag){
    document.getElementById('viewSelect').classList.toggle('hidden', !flag);
    document.getElementById('viewReader').classList.toggle('hidden', flag);
    document.getElementById('pageTitle').classList.toggle('hidden', !flag);
  }
  function applyPref(pref){
    const dyn=document.getElementById('wk-dyn'); if(!dyn) return;
    dyn.textContent = ':root{--fpx:'+pref.fontPx+';--lh:'+pref.lineH+';--maxw:'+pref.maxW+'px;--h1scale:1.2;--h2scale:1.1;}';
    document.documentElement.classList.toggle('light', pref.theme==='light');
  }

  function renderVolList(volumes, onPick){
    const box=document.getElementById('volList');
    box.innerHTML = volumes.map((v,i)=>{
      const count=v.chapters.filter(c=>c.cid!==v.cid).length;
      return '<div style="padding:10px 6px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
           + '<div style="flex:1;min-width:220px">'+v.title+' <span class="muted" style="font-size:12px">('+count+'章)</span></div>'
           + '<button class="wk-btn pick" data-idx="'+i+'">从本卷开始阅读</button>'
           + '</div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.pick'), function(btn){
      btn.addEventListener('click', function(){ onPick(+btn.getAttribute('data-idx')); });
    });
  }

  function renderTOC(vol, curIdx, handlers){
    const onClickChapter = handlers && handlers.onClickChapter;
    const onClickImages  = handlers && handlers.onClickImages;
    const links = document.getElementById('tocLinks'); if(!links) return;
    const chapters = vol.chapters.filter(c=>c.cid!==vol.cid);
    let html = chapters.map(function(c,i){
      return '<a href="#" data-role="chap" data-i="'+i+'" class="'+(i===curIdx?'active':'')+'">'+c.title+'</a>';
    }).join('');
    html += '<a href="#" data-role="images">插图</a>';
    links.innerHTML = html;
    Array.prototype.forEach.call(links.querySelectorAll('a'), function(a){
      a.addEventListener('click', function(e){
        e.preventDefault();
        const role = a.getAttribute('data-role');
        if(role==='images'){ if (typeof onClickImages==='function') onClickImages(); }
        else{ if (typeof onClickChapter==='function') onClickChapter(+a.getAttribute('data-i')); }
      });
    });
  }
  function setTOCActive(vol, curIdx, onImages){
    const links = document.querySelectorAll('#tocLinks a');
    Array.prototype.forEach.call(links, a=>a.classList.remove('active'));
    if(onImages){
      const n = document.querySelector('#tocLinks a[data-role="images"]');
      if (n) n.classList.add('active');
    }else{
      const n = document.querySelector('#tocLinks a[data-role="chap"][data-i="'+curIdx+'"]');
      if (n) n.classList.add('active');
    }
  }
  function renderImages(urls){
    const grid = document.getElementById('imgGrid');
    if(!urls.length){ grid.innerHTML = '<div class="muted">(本卷暂无插图)</div>'; return; }
    grid.innerHTML = urls.map(function(u,i){
      return '<figure style="margin:0 0 10px">'
        + '<a href="'+u+'" target="_blank" rel="noopener"><img loading="lazy" src="'+u+'" alt="插图'+(i+1)+'" style="width:100%;height:auto;border-radius:8px"/></a>'
        + '<figcaption style="font-size:12px;color:var(--muted);margin-top:6px;word-break:break-all">'+(i+1)+'. '+u+'</figcaption>'
        + '</figure>';
    }).join('');
  }

  function updateProgressBar(){
    const bar = document.getElementById('progressBar');
    const sh = document.documentElement.scrollHeight - window.innerHeight;
    const y  = window.scrollY || document.documentElement.scrollTop || 0;
    const pct = Math.max(0, Math.min(1, sh>0 ? y/sh : 0));
    if(bar) bar.style.width = (pct*100).toFixed(2)+'%';
  }

  async function runReader({ lib, aid, cidCurrent=null }){
    const volBlobCache  = new Map();
    const volSplitCache = new Map();
    const imgCache      = new Map();

    const pref = loadPref();
    const titleEl = document.querySelector('h1');
    const titleInit = ((titleEl && titleEl.textContent) || document.title || '在线阅读').replace(/[\\/:*?"<>|]/g,' ').trim();
    const indexURL = 'https://www.wenku8.net/novel/'+lib+'/'+aid+'/index.htm';

    mountReaderSkeleton(titleInit, pref);
    setPageTitle(titleInit); setDocTitle(titleInit);
    const idxBtn = document.getElementById('btnIndex'); if (idxBtn) idxBtn.href = indexURL;
    applyPref(pref);

    // 偏好控件
    const rngFont=document.getElementById('rngFont'), rngLine=document.getElementById('rngLine'), rngWidth=document.getElementById('rngWidth'), btnTheme=document.getElementById('btnTheme');
    rngFont.oninput=function(){ pref.fontPx=+rngFont.value; applyPref(pref); savePref(pref); };
    rngLine.oninput=function(){ pref.lineH=(+rngLine.value)/10; applyPref(pref); savePref(pref); };
    rngWidth.oninput=function(){ pref.maxW=+rngWidth.value; applyPref(pref); savePref(pref); };
    btnTheme.onclick=function(){ pref.theme=(pref.theme==='dark'?'light':'dark'); applyPref(pref); savePref(pref); };

    // 目录面板
    const sideTOC = document.getElementById('sideTOC');
    const btnTocCollapse = document.getElementById('btnTocCollapse');
    const btnTocExpand = document.getElementById('btnTocExpand');
    const syncExpandBtn = function(){ if(btnTocExpand && sideTOC) btnTocExpand.style.display = sideTOC.classList.contains('open') ? 'none' : 'block'; };
    if (btnTocCollapse && sideTOC) btnTocCollapse.onclick = function(){ sideTOC.classList.remove('open'); };
    if (btnTocExpand && sideTOC) btnTocExpand.onclick = function(){ sideTOC.classList.add('open'); };
    syncExpandBtn();
    if (sideTOC) new MutationObserver(syncExpandBtn).observe(sideTOC, { attributes: true, attributeFilter: ['class'] });

    // 解析目录
    setProgressText('解析目录中…');
    const volumes = await parseIndexVolumes(indexURL);
    const defaultVolIdx = locateCurrentVolume(volumes, cidCurrent);
    setProgressText('');

    const state = { curVolIdx:null, curChapIdx:null, onImages:false };
    const getTextChapters = v => v.chapters.filter(c=>c.cid!==v.cid);

    renderVolList(volumes, pickVol);

    // 控件
    const btnBack = document.getElementById('btnBackSel');
    const btnPrevVol = document.getElementById('btnPrevVol');
    const btnNextVol = document.getElementById('btnNextVol');
    const btnPrevChap= document.getElementById('btnPrevChap');
    const btnNextChap= document.getElementById('btnNextChap');
    const btnDownChap= document.getElementById('btnDownChap');
    const btnDownVol = document.getElementById('btnDownVol');
    const btnImages  = document.getElementById('btnImages');

    if (btnBack) btnBack.onclick = function(){ showSelectView(true); setDocTitle(titleInit); };

    async function showImages(){
      if(state.curVolIdx==null){ toast('请先选择卷','error'); return; }
      const vol = volumes[state.curVolIdx];
      let urls = imgCache.get(vol.cid);
      if(!urls){ setProgressText('插图加载中…'); urls = await fetchPackImagesByVol(aid, vol.cid); imgCache.set(vol.cid, urls); setProgressText(''); }
      renderImages(urls);
      state.onImages = true;
      setVolTitle(vol.title + ' · 插图');
      setChapTitle('插图');
      setDocTitle(vol.title + ' · 插图');
      setTOCActive(vol, state.curChapIdx, true);
      document.getElementById('imagesSection').classList.remove('hidden');
      document.getElementById('imagesSection').scrollIntoView({behavior:'smooth', block:'start'});
    }
    if (btnImages) btnImages.onclick = showImages;

    // 下载
    if (btnDownChap) btnDownChap.onclick = async function(){
      if(state.curVolIdx==null || state.curChapIdx==null) return;
      const vol = volumes[state.curVolIdx];
      const chapters = getTextChapters(vol);
      const segs = await ensureSplitVolume(aid, vol);
      const seg = segs[state.curChapIdx] || {raw:''};
      const safeTitle = (chapters[state.curChapIdx].title||'chapter').replace(/[\\/:*?"<>|]/g,' ').trim();
      const name = aid+'_'+chapters[state.curChapIdx].cid+'_'+safeTitle+'.txt';
      const payload = (seg.raw||'').replace(/\uFEFF/g,'');
      if (!payload.trim()){ toast('本章内容为空，可能需要登录或正在重试…','error'); return; }
      downloadText(name, payload);
    };
    if (btnDownVol) btnDownVol.onclick = async function(){
      if(state.curVolIdx==null){ toast('请先选择卷','error'); return; }
      const vol = volumes[state.curVolIdx];
      const chapters = getTextChapters(vol);
      const segs = await ensureSplitVolume(aid, vol);
      const lines=['【'+vol.title+'】'];
      for(let i=0;i<chapters.length;i++){
        const c=chapters[i], seg=segs[i]||{raw:''};
        lines.push('', '《'+(c.title||'')+'》', '', (seg.raw||'').replace(/\uFEFF/g,''), '', '----------------------------------------');
      }
      const txt=lines.join('\n');
      const safeName = (aid+'_'+vol.cid+'_'+vol.title).replace(/[\\/:*?"<>|]/g,' ').trim()+'.txt';
      if (!txt.replace(/\s/g,'').length){ toast('本卷内容为空，可能需要登录或稍后重试','error'); return; }
      downloadText(safeName, txt);
    };

    function onClickChapter(i){
      const vol = volumes[state.curVolIdx];
      const chapters = getTextChapters(vol);
      if(i<0 || i>=chapters.length) return;
      state.curChapIdx = i;
      state.onImages = false;
      loadCurrentChapter();
    }

    function pickVol(i){
      state.curVolIdx = i;
      const vol = volumes[state.curVolIdx];
      const chapters = getTextChapters(vol);
      renderTOC(vol, 0, { onClickChapter:onClickChapter, onClickImages: showImages });
      showSelectView(false);
      document.getElementById('imagesSection').classList.add('hidden');
      if(!chapters.length){
        setVolTitle(vol.title);
        setChapTitle('（本卷无正文，您可点击“插图”查看插图）');
        document.getElementById('textArea').innerHTML = '<p class="muted">(无正文)</p>';
        setTOCActive(vol, -1, false);
        document.getElementById('sideTOC').classList.add('open');
        return;
      }
      state.curChapIdx = 0;
      state.onImages = false;
      loadCurrentChapter();
      document.getElementById('sideTOC').classList.add('open');
    }

    async function ensureSplitVolume(aid, vol){
      if (volSplitCache.has(vol.cid)) return volSplitCache.get(vol.cid);
      let volRaw = volBlobCache.get(vol.cid);
      if(!volRaw){
        setProgressText('整卷加载中…');
        volRaw = await fetchWholeVolumeText(aid, vol);
        if(!/\S/.test(volRaw)){ await sleep(250); volRaw = await fetchWholeVolumeText(aid, vol); }
        volBlobCache.set(vol.cid, volRaw);
        setProgressText('');
      }
      const chapters = getTextChapters(vol);
      const parts = splitVolumeByTitles(volRaw, chapters);

      const all_empty = parts.every(p => p.trim() === '');
      if (all_empty && chapters.length > 0 && volRaw.trim() !== '') {
          setProgressText('切分失败，回退逐章... (1/'+chapters.length+')');
          const new_parts = [];
          for (let i = 0; i < chapters.length; i++) {
              const c = chapters[i];
              const dummyVol = { cid: c.cid, chapters: [] };
              let chap_raw = await fetchWholeVolumeText(aid, dummyVol);
              if(!/\S/.test(chap_raw) || chap_raw.replace(/\s/g,'').length < CFG.CHAP_MIN_LEN){
                  await sleep(250);
                  chap_raw = await fetchWholeVolumeText(aid, dummyVol);
              }
              new_parts.push(chap_raw || '');
              setProgressText('切分失败，回退逐章... ('+(i+1)+'/'+chapters.length+')');
              await sleep(60);
          }
          setProgressText('');
          const segs = new_parts.map(p=>({ raw:p, html: txtToHtml(p) }));
          volSplitCache.set(vol.cid, segs);
          return segs;
      }
      const segs = parts.map(p=>({ raw:p, html: txtToHtml(p) }));
      volSplitCache.set(vol.cid, segs);
      return segs;
    }

    async function loadCurrentChapter(){
      const vol = volumes[state.curVolIdx];
      const chapters = getTextChapters(vol);
      const c = chapters[state.curChapIdx];

      setVolTitle(vol.title + ' · ' + c.title);
      setChapTitle(c.title);
      setDocTitle(vol.title + ' · ' + c.title);
      setProgressText('本章加载中…');

      document.getElementById('imagesSection').classList.add('hidden');
      const textArea = document.getElementById('textArea');
      textArea.innerHTML = '<p class="muted">（加载中…）</p>';

      const segs = await ensureSplitVolume(aid, vol);
      const seg = segs[state.curChapIdx];

      if(seg && /\S/.test(seg.raw)){
        textArea.innerHTML = seg.html || '<p class="muted">（空）</p>';
      }else{
        textArea.innerHTML = '<p class="muted">（章节加载失败，<a href="#" id="retrySplit">重试</a>）</p>';
        const r=document.getElementById('retrySplit');
        if(r) r.onclick=async function(ev){ ev.preventDefault(); volSplitCache.delete(vol.cid); volBlobCache.delete(vol.cid); await loadCurrentChapter(); };
      }

      setProgressText('');
      setTOCActive(vol, state.curChapIdx, false);
      try{ window.scrollTo({top:0, behavior:'auto'}); }catch(e){ window.scrollTo(0,0); }
      updateProgressBar();
    }

    // 导航 & 热键
    document.addEventListener('keydown', function(e){
      var tag = (e.target && e.target.tagName ? e.target.tagName : '').toUpperCase();
      if (tag==='INPUT' || tag==='TEXTAREA') return;
      if (e.key==='ArrowRight'){ var n1=document.getElementById('btnNextChap'); if(n1) n1.click(); }
      else if (e.key==='ArrowLeft'){ var n2=document.getElementById('btnPrevChap'); if(n2) n2.click(); }
      else if (e.key==='n'){ var n3=document.getElementById('btnNextVol'); if(n3) n3.click(); }
      else if (e.key==='p'){ var n4=document.getElementById('btnPrevVol'); if(n4) n4.click(); }
      else if (e.key==='i'){ var n5=document.getElementById('btnImages'); if(n5) n5.click(); }
      else if (e.key==='t'){ var n6=document.getElementById('btnTheme'); if(n6) n6.click(); }
      else if (e.key==='[') { rngFont.value=Math.max(14,(+rngFont.value-1)); rngFont.oninput(); }
      else if (e.key===']') { rngFont.value=Math.min(24,(+rngFont.value+1)); rngFont.oninput(); }
      else if (e.key==='j') window.scrollBy({top:window.innerHeight*0.85, behavior:'smooth'});
      else if (e.key==='k') window.scrollBy({top:-window.innerHeight*0.85, behavior:'smooth'});
    });
    document.addEventListener('click', function(e){
      if(e && e.target && e.target.id==='pageTitle'){
        document.getElementById('sideTOC').classList.toggle('open');
      }
    });
    window.addEventListener('scroll', updateProgressBar, {passive:true});
    updateProgressBar();

    // 章/卷导航绑定
    if (btnPrevChap) btnPrevChap.onclick = function(){
      if (state.curVolIdx == null) return;
      const vol = volumes[state.curVolIdx];
      const list = vol.chapters.filter(c => c.cid !== vol.cid);
      if (state.curChapIdx > 0) {
        state.curChapIdx--; state.onImages = false; loadCurrentChapter(); return;
      }
      if (state.curVolIdx > 0) {
        state.curVolIdx--;
        const v2 = volumes[state.curVolIdx];
        const l2 = v2.chapters.filter(c => c.cid !== v2.cid);
        state.curChapIdx = Math.max(0, l2.length - 1);
        state.onImages = false;
        renderTOC(v2, state.curChapIdx, { onClickChapter:onClickChapter, onClickImages: showImages });
        loadCurrentChapter();
      }
    };

    if (btnNextChap) btnNextChap.onclick = function(){
      if (state.curVolIdx == null) return;
      const vol = volumes[state.curVolIdx];
      const list = vol.chapters.filter(c => c.cid !== vol.cid);
      if (state.curChapIdx < list.length - 1) {
        state.curChapIdx++; state.onImages = false; loadCurrentChapter(); return;
      }
      if (state.curVolIdx < volumes.length - 1) {
        state.curVolIdx++;
        const v2 = volumes[state.curVolIdx];
        state.curChapIdx = 0; state.onImages = false;
        renderTOC(v2, state.curChapIdx, { onClickChapter:onClickChapter, onClickImages: showImages });
        loadCurrentChapter();
      }
    };

    if (btnPrevVol) btnPrevVol.onclick = function(){
      if (state.curVolIdx == null) { pickVol(Math.max(0, defaultVolIdx - 1)); return; }
      state.curVolIdx = Math.max(0, state.curVolIdx - 1);
      const v = volumes[state.curVolIdx];
      state.curChapIdx = 0; state.onImages = false;
      renderTOC(v, state.curChapIdx, { onClickChapter:onClickChapter, onClickImages: showImages });
      loadCurrentChapter();
    };

    if (btnNextVol) btnNextVol.onclick = function(){
      if (state.curVolIdx == null) { pickVol(defaultVolIdx); return; }
      state.curVolIdx = Math.min(volumes.length - 1, state.curVolIdx + 1);
      const v = volumes[state.curVolIdx];
      state.curChapIdx = 0; state.onImages = false;
      renderTOC(v, state.curChapIdx, { onClickChapter:onClickChapter, onClickImages: showImages });
      loadCurrentChapter();
    };
  } // <- 结束 runReader

  /* ============ 入口：书籍页/目录页/正文页 ============ */
  function guessLibFromBookPage(aid){
    const aidStr = String(aid);
    const hrefs = Array.prototype.map.call(document.querySelectorAll('a[href*="/novel/"]'), el=>el.getAttribute('href')||'');
    for (let h of hrefs) { const m = h.match(/\/novel\/(\d+)\/(\d+)\/index\.htm/); if (m && m[2] === aidStr) return +m[1]; }
    if (hrefs.some(h => /\/novel\/0\/\d+\/index\.htm/.test(h))) return 0;
    const any = hrefs.map(h => h.match(/\/novel\/(\d+)\/\d+\/index\.htm/)).find(Boolean);
    return any ? +any[1] : 0;
  }

  async function initBookPage(){
    const m = location.pathname.match(/\/book\/(\d+)\.htm$/);
    const aid = m ? +m[1] : 0; if(!aid) return;
    const lib = guessLibFromBookPage(aid);

    const mount = document.querySelector('#content') || document.body;
    const box=document.createElement('div'); box.style.cssText='margin:10px 0;padding:8px;border:1px dashed #8aa9ff;border-radius:8px;'; mount.prepend(box);

    addBtn(box, '尝试从数据库下载全书', async function(){
      const libs = Array.from(new Set([lib, 0, 1].filter(v => v != null)));
      let text=null;
      outer: for(const host of CFG.DL_HOSTS){
        for (const L of libs) {
          const url=host+'/txtgbk/'+L+'/'+aid+'.txt';
          try{
            const t=await gmFetchText(url,{encoding:'gb18030'});
            if(isLikelyBookTxt(t)){ text=t; break outer; }
          }catch(e){}
        }
      }
      if(!text) throw new Error('整书直链不可用（可能未登录/权限限制/镜像临时失效）');
      downloadText(aid+'.txt', text);
    });
  }

  async function initIndexPage(){
    const m=location.pathname.match(/\/novel\/(\d+)\/(\d+)\/index\.htm$/); if(!m) return;
    const lib=+m[1], aid=+m[2];
    const mount = document.querySelector('#content') || document.body;
    const box=document.createElement('div'); box.style.cssText='margin:10px 0;padding:8px;border:1px dashed #8aa9ff;border-radius:8px;'; mount.prepend(box);
    addBtn(box, '直连数据库在线阅读', async function(){ await runReader({ lib:lib, aid:aid, cidCurrent:null }); });
  }

  async function initReaderPage(){
    const m=location.pathname.match(/\/novel\/(\d+)\/(\d+)\/(\d+)\.htm$/); if(!m) return;
    const lib=+m[1], aid=+m[2], cid=+m[3];
    const anchorBtn = Array.prototype.find.call(document.querySelectorAll('a,button'), function(x){ return /下载本章\s*TXT/.test(x.textContent||''); });
    const mount = (anchorBtn && anchorBtn.parentElement) ? anchorBtn.parentElement : (document.querySelector('#content')||document.body);
    const box=document.createElement('div'); box.style.cssText='margin:10px 0;padding:8px;border:1px dashed #8aa9ff;border-radius:8px;'; mount.prepend(box);

    addBtn(box, '下载本章 TXT（packtxt.php·gbk）', async function(){
      let text=null; const charsets=[{q:'gbk', enc:'gb18030'}, {q:'utf-8', enc:'utf-8'}];
      outer: for(const host of CFG.DL_HOSTS){ for(const cs of charsets){ const url=host+'/packtxt.php?aid='+aid+'&vid='+cid+'&charset='+cs.q;
        try{
          const t=await gmFetchText(url,{encoding:cs.enc});
          if(t && t.replace(/\s/g,'').length >= CFG.CHAP_MIN_LEN){ text=t; break outer; }
        }catch(e){}
      } }
      if(!text) throw new Error('本章下载失败（请确认已登录）');
      const h1=document.querySelector('h1');
      const title=((h1 && h1.textContent) || document.title || 'chapter').replace(/[\\/:*?"<>|]/g,' ').trim();
      downloadText(aid+'_'+cid+'_'+title+'.txt', text);
    });

    addBtn(box, '直连数据库在线阅读', async function(){ await runReader({ lib:lib, aid:aid, cidCurrent: cid }); });
  }

  const path = location.pathname;
  try {
    if (/\/book\/\d+\.htm$/.test(path)) {
      initBookPage();
    } else if (/\/novel\/\d+\/\d+\/index\.htm$/.test(path)) {
      initIndexPage();
    } else if (/\/novel\/\d+\/\d+\/\d+\.htm$/.test(path)) {
      initReaderPage();
    }
  } catch (e) {
    err(e);
    var msg = (e && e.message) ? e.message : String(e);
    toast('脚本初始化异常：' + msg, 'error');
  }
})();

/* ======================================================================
 * WK-EPUB Addon（本地TXT工作流 + 智能解码 + 图片预览与在线阅读一致）
 * ====================================================================== */
(function(){
  'use strict';
  const WK_EPUB = {
    TOC_LS_KEY: 'wk_epub_toc_rules_v3', // Keep v3 key
    PROGRESS_ID: '__wk_epub_overlay__',
    TIMEOUT: 30000,
    DL_HOSTS: ['https://dl.wenku8.com','https://dl1.wenku8.com']
  };

  /* ------------ JSZip loader ------------ */
  function loadJSZip(){
    return new Promise((resolve, reject)=>{
      function pick(){
        try{
          const w = (typeof unsafeWindow!=='undefined' && unsafeWindow) || window;
          const cand = w.JSZip;
          if (!cand) return null;
          return (typeof cand === 'function') ? cand
               : (typeof cand==='object' && typeof cand.JSZip === 'function') ? cand.JSZip
               : (typeof cand==='object' && typeof cand.default === 'function') ? cand.default
               : null;
        }catch(e){ return null; }
      }
      const have = pick();
      if (have) return resolve(have);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload = ()=>{ const ctor = pick(); if (ctor) resolve(ctor); else reject(new Error('JSZip 已加载，但未导出构造函数')); };
      s.onerror = ()=> reject(new Error('JSZip 加载失败'));
      document.head.appendChild(s);
    });
  }

  /* ------------ 小工具 ------------ */
  const sleep = ms=> new Promise(r=>setTimeout(r, ms));
  const escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const nowIso = ()=> new Date().toISOString().slice(0,10);
  const uuid = ()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{ const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16); });
  const safeName = s => (s||'').replace(/[\\/:*?"<>|]/g,' ').trim();
  const MIME = { xhtml:'application/xhtml+xml', opf:'application/oebps-package+xml', css:'text/css',
                 jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', bmp:'image/bmp', svg:'image/svg+xml' };
  const EPUB_CSS = 'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6}h1,h2,h3{margin:.6em 0 .3em} p{ text-indent:2em; margin:.4em 0 } figure{margin:0 0 1em;page-break-inside:avoid} img{max-width:100%;height:auto;display:block;margin:0 auto}';

  // 与主脚本一致的文本请求
  function gmFetchText(url, {encoding='utf-8', timeout=WK_EPUB.TIMEOUT}={}){
    const idxEl = document.getElementById('btnIndex');
    const refList = [
      idxEl ? idxEl.getAttribute('href') : '',
      'https://www.wenku8.net/',
      'https://pic.777743.xyz/'
    ].filter(Boolean);
    let idx=0;
    return new Promise((resolve,reject)=>{
      const tryOnce=()=>{
        GM_xmlhttpRequest({
          method:'GET', url, timeout, responseType:'arraybuffer', withCredentials:true,
          headers:{
            'Referer': refList[Math.min(idx, refList.length-1)],
            'Origin': 'https://www.wenku8.net',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': navigator.language || 'zh-CN,zh;q=0.9'
          },
          onload: res=>{
            if(res.status<200||res.status>=300){
              if(idx<refList.length-1){ idx++; tryOnce(); return; }
              reject(new Error('HTTP ' + res.status)); return;
            }
            try{
              const dec=new TextDecoder(encoding,{fatal:false});
              resolve(dec.decode(res.response));
            }catch(e){ reject(e); }
          },
          onerror: ()=>{ if(idx<refList.length-1){ idx++; tryOnce(); } else reject(new Error('网络错误')); },
          ontimeout: ()=>{ if(idx<refList.length-1){ idx++; tryOnce(); } else reject(new Error('超时')); },
        });
      };
      tryOnce();
    });
  }

  // 本模块内复制一份图片解析逻辑
  function normalizeImageHost(u){
    try{ if(/^https?:\/\//i.test(u)){ const url=new URL(u); if(url.hostname.toLowerCase()==='pic.wenku8.com'){ url.hostname='pic.777743.xyz'; return url.toString(); } } }catch(e){}
    return u;
  }
  function extractAndSortImagesLocal(raw){
    if (!raw) return [];
    const out = new Set();
    function pushIfImg(u){
      u = normalizeImageHost(u||'');
      if (!u) return;
      u = u.replace(/&amp;/g,'&').trim();
      if (/^https?:\/\//i.test(u) && /\.(?:jpe?g|png|gif|webp|bmp)(?:[?#].*)?$/i.test(u)) out.add(u);
    }
    let doc=null; try{ doc=new DOMParser().parseFromString(raw,'text/html'); }catch(e){}
    if(doc){
      Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), a=>pushIfImg(a.getAttribute('href')));
      Array.prototype.forEach.call(doc.querySelectorAll('[title]'), el=>pushIfImg(el.getAttribute('title')));
      Array.prototype.forEach.call(doc.querySelectorAll('[onclick]'), el=>{
        const s=el.getAttribute('onclick')||''; let m; const re=/imgclickshow\(\s*(?:"[^"]*"|'[^']*')\s*,\s*(?:"([^"]+)"|'([^']+)')\s*\)/gi;
        while((m=re.exec(s))!==null) pushIfImg(m[1]||m[2]);
      });
      Array.prototype.forEach.call(doc.querySelectorAll('a'), a=>pushIfImg(a.textContent||''));
    }
    const reTxt=/(https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|gif|webp|bmp))(?:[?#][^\s"'<>]*)?/gi; let m2; while((m2=reTxt.exec(raw))!==null) pushIfImg(m2[1]);
    const arr=Array.from(out);
    function num(u){ const mm1=u.match(/(\d+)(?=\.[a-z]+(?:[?#]|$))/i); if(mm1) return +mm1[1]; const mm2=u.match(/(\d+)/g); return mm2? +mm2[mm2.length-1] : Number.POSITIVE_INFINITY; }
    arr.sort((a,b)=>(num(a)-num(b)) || a.localeCompare(b));
    return arr;
  }

  function overlay(){
    let box = document.getElementById(WK_EPUB.PROGRESS_ID);
    if(!box){
      box = document.createElement('div'); box.id = WK_EPUB.PROGRESS_ID;
      box.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;color:#fff;display:flex;align-items:center;justify-content:center';
      box.innerHTML = '<div style="min-width:460px;max-width:70%;background:#111827;border:1px solid #334155;border-radius:14px;padding:18px;box-shadow:0 16px 60px rgba(0,0,0,.35); margin: auto;">' // Added margin: auto
        + '<div id="wk_epub_t" style="font-weight:600;margin-bottom:6px">准备中…</div>'
        + '<div id="wk_epub_d" style="font-size:13px;opacity:.9;margin-bottom:10px">…</div>'
        + '<div style="height:10px;background:#0f172a;border-radius:6px;overflow:hidden"><div id="wk_epub_b" style="height:100%;width:0;background:linear-gradient(90deg,#60a5fa,#a78bfa)"></div></div>'
        + '<div id="wk_epub_tail" style="font-size:12px;opacity:.85;margin-top:8px"></div>'
        + '</div>';
      document.body.appendChild(box);
    }
    const set = (t,d,p,tail)=>{
      const T=document.getElementById('wk_epub_t'), D=document.getElementById('wk_epub_d'), B=document.getElementById('wk_epub_b'), X=document.getElementById('wk_epub_tail');
      if(t!=null && T) T.textContent=t; if(d!=null && D) D.textContent=d;
      if(p!=null && B) B.style.width = (Math.max(0,Math.min(1,p))*100).toFixed(1)+'%';
      if(tail!=null && X) X.textContent=tail;
    };
    const close = ()=>{ try{ box.remove(); }catch(e){} };
    return { set, close };
  }

  /* ------------ 智能解码 + 手动切换编码 ------------ */
  function decodeWith(buf, enc){ try{ return new TextDecoder(enc,{fatal:false}).decode(buf); }catch(e){ return ''; } }
  function guessEncoding(buf){
    const u8=new Uint8Array(buf);
    if (u8.length>=3 && u8[0]===0xEF && u8[1]===0xBB && u8[2]===0xBF) return 'utf-8';
    if (u8.length>=2 && u8[0]===0xFF && u8[1]===0xFE) return 'utf-16le';
    if (u8.length>=2 && u8[0]===0xFE && u8[1]===0xFF) return 'utf-16be';
    return null;
  }

function isValidUTF8(u8){
  let i = 0;
  while (i < u8.length){
    const b = u8[i];
    if (b <= 0x7F){ i++; continue; }
    let need = 0;
    if ((b & 0xE0) === 0xC0) need = 1;
    else if ((b & 0xF0) === 0xE0) need = 2;
    else if ((b & 0xF8) === 0xF0) need = 3;
    else return false;
    if (i + need >= u8.length) return false;
    for (let j=1; j<=need; j++){
      if ((u8[i+j] & 0xC0) !== 0x80) return false;
    }
    i += need + 1;
  }
  return true;
}

function scoreText(s, enc, utf8Valid){
  if(!s) return -1e9;
  const bad = (s.match(/\uFFFD/g)||[]).length;
  const cjk = (s.match(/[\u4E00-\u9FFF]/g)||[]).length;
  const ascii = (s.match(/[\x20-\x7E]/g)||[]).length;
  const punc = (s.match(/[，。？！；：“”（）《》、…]/g)||[]).length;
  const moj = (s.match(/[锟銆浣鏂绛鐗涓閲璇鍙]/g)||[]).length;
  let score = cjk*3 + punc*2 + ascii*0.1 - bad*80 - moj*15;
  if (enc === 'utf-8' && utf8Valid) score += 1200;
  if (/^utf-16/i.test(enc)) score -= 200;
  return score;
}

function autoDecode(buf){
  const u8 = new Uint8Array(buf);
  const utf8Valid = isValidUTF8(u8);
  const cands = ['utf-8', 'gb18030', 'big5', 'utf-16le', 'utf-16be'];
  let bestEnc = 'utf-8', bestTxt = '', bestScore = -1e9;
  for (const enc of cands){
    let txt = '';
    try{ txt = new TextDecoder(enc,{fatal:false}).decode(buf); }catch{ txt=''; }
    const sc = scoreText(txt, enc, utf8Valid);
    if (sc > bestScore){ bestScore = sc; bestEnc = enc; bestTxt = txt; }
  }
  return { encoding: bestEnc, text: bestTxt };
}

  function openTxtPicker(){
    return new Promise((resolve)=>{
      const m = document.createElement('div');
      m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center';
      m.innerHTML = '<div style="width:min(860px,92%);background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:16px;padding:16px; margin: auto;">' // Added margin: auto
        + '<h3 style="margin:0 0 10px">步骤 1 / 3：选择整书 TXT</h3>'
        + '<p style="opacity:.9">请先在“书籍页”点【尝试从数据库下载全书】，把 <code>.txt</code> 保存到本地，然后在此上传。</p>'
        + '<div style="display:flex;gap:8px;align-items:center;margin:8px 0">'
        + '  <input id="wk_txt_file" type="file" accept=".txt,text/plain">'
        + '  <label style="font-size:12px;opacity:.85">编码：'
        + '    <select id="wk_enc_sel"><option value="auto" selected>自动检测</option><option value="gb18030">GB18030</option><option value="gbk">GBK</option><option value="utf-8">UTF-8</option><option value="big5">Big5</option><option value="utf-16le">UTF-16LE</option><option value="utf-16be">UTF-16BE</option></select>'
        + '  </label>'
        + '</div>'
        + '<div id="wk_txt_name" style="font-size:12px;opacity:.8;margin-bottom:8px"></div>'
        + '<div style="background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;max-height:240px;overflow:auto;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace" id="wk_txt_preview">（选择文件后将显示预览）</div>'
        + '<div style="margin-top:12px;display:flex;gap:10px"><button class="wk-btn" id="wk_txt_ok" disabled>继续</button><button class="wk-btn" id="wk_txt_cancel">退出</button></div>'
        + '</div>';
      document.body.appendChild(m);

      let file=null, buf=null, decoded={encoding:'', text:''};
      const fi=m.querySelector('#wk_txt_file'), ok=m.querySelector('#wk_txt_ok'), nm=m.querySelector('#wk_txt_name'), pv=m.querySelector('#wk_txt_preview'), sel=m.querySelector('#wk_enc_sel');

async function refreshDecode(){
  if(!buf){
    pv.textContent = '（尚未选择文件）'; ok.disabled = true; nm.textContent = ''; return;
  }
  const mode = sel.value;
  decoded = (mode === 'auto') ? autoDecode(buf) : { encoding: mode, text: decodeWith(buf, mode) };
  const lines = decoded.text.split('\n');
  pv.textContent = lines.slice(0, 60).join('\n') + (lines.length > 60 ? '\n…' : '');
  ok.disabled = !(decoded.text && decoded.text.trim());
  nm.textContent = file ? `已选择：${file.name}（${(file.size/1024/1024).toFixed(2)}MB），检测结果：${decoded.encoding}（可在上方手动切换）` : '';
  if (sel.value === 'auto') { sel.value = decoded.encoding; }
}

      fi.onchange = async function(){
        file = (fi.files && fi.files[0]) || null;
        if(!file){ buf=null; pv.textContent='（未选择）'; ok.disabled=true; nm.textContent=''; return; }
        buf = await file.arrayBuffer();
        await refreshDecode();
      };
      sel.onchange = refreshDecode;
      m.querySelector('#wk_txt_cancel').onclick = function(){ m.remove(); resolve(null); };
      m.querySelector('#wk_txt_ok').onclick = function(){ if(decoded.text){ m.remove(); resolve({ name:file.name, text:decoded.text, size:file.size, encoding:decoded.encoding }); } };
    });
  }

  /* ------------ 目录规则 ------------ */
  function loadTocRules(){
    const dflt={
      includes:[
        '^第[一二三四五六七八九十百千0-9]+(卷|部|集|章|话|節|回)',
        '^(?:番外(?:\\s*\\d+)?|外传|外傳)\\b',
        '^BD',
        '^短篇集'
      ],
      exclude:'(?:目录|插頁|后记|後記|BOX|插图|插圖)'
    };
    try{
      const s = localStorage.getItem(WK_EPUB.TOC_LS_KEY); // Reads v3 key
      const j = s ? JSON.parse(s) : null;
      if (j && Array.isArray(j.includes) && typeof j.exclude==='string') return j;
    }catch(e){}
    return dflt;
  }
  function saveTocRules(r){ try{ localStorage.setItem(WK_EPUB.TOC_LS_KEY, JSON.stringify(r)); }catch(e){} } // Saves to v3 key

function makeFlexibleTitleRegex(s) {
  if (!s) return '';
  s = String(s).trim();
  // Split the string by any whitespace sequence.
  const parts = s.split(/\s+/);
  // Escape regex special characters in each part.
  const escaped_parts = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Join the parts with a flexible whitespace matcher that requires at least one space.
  const joined = escaped_parts.join('[\\s\\u3000]+');
  // Return a regex that matches from the start of the line.
  return `^${joined}`;
}

function extractCandidateHeadings(txt) {
  const L = txt.replace(/\uFEFF/g, '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const isJunkPunc = /[「」『』：:()（）]/;
  // New, more reliable checks to filter out paragraphs
  const startsWithIndentation = /^[　\s]{2,}/;
  const endsWithSentencePunc = /[。！？…”』]$/;

  for (let i = 0; i < L.length; i++) {
    const s = L[i].trim();
    // 1. Basic length filter
    if (!s || s.length < 2 || s.length > 80) continue;
    // 2. Filter out lines containing typical dialogue/quote marks
    if (isJunkPunc.test(s)) continue;

    // 3. Filter out lines that are clearly paragraphs
    const originalLine = L[i];
    if (startsWithIndentation.test(originalLine)) continue;
    if (endsWithSentencePunc.test(s)) continue;

    // If it passes all the "is not a paragraph" checks, it's a candidate.
    out.push({ i, s });
  }
  const seen = new Set();
  return out.filter(o => { const k = o.s; if (seen.has(k)) return false; seen.add(k); return true; });
}

function compileRules(rules) {
  const inc = [];
  for (const s of (rules.includes || [])) { try { inc.push(new RegExp(s, 'iu')); } catch {} }
  let exc = null;
  if (rules.exclude) { try { exc = new RegExp(rules.exclude, 'iu'); } catch {} }
  return { inc, exc };
}

// ========== SORT FIX START: Removed localeCompare sort ==========
function classifyCandidates(cands, rules) {
  const { inc, exc } = compileRules(rules);
  const hit = [], miss = [];
  // Keep original order by iterating through candidates which preserve it
  for (const { s } of cands) { // cands is the array [{i,s}, {i,s}, ...] from extractCandidateHeadings
    const excluded = exc ? exc.test(s) : false;
    const included = inc.length ? inc.some(r => r.test(s)) : false;
    if (!excluded && included) {
        hit.push(s); // Add to hit list in the order they appear in the text
    } else {
        miss.push(s); // Add to miss list in the order they appear
    }
  }
  // Return without sorting, preserving the original text order
  return { hit: hit, miss: miss };
}
// ========== SORT FIX END ==========

function toLinesDistinct(s) {
  return [...new Set(String(s).split('\n').map(x => x.trim()).filter(Boolean))];
}
function linesToText(lines) {
  return toLinesDistinct(lines.join('\n')).join('\n');
}

  function splitByHeadingRules(raw, rules){
    const R = compileRules(rules);
    const lines = raw.replace(/\uFEFF/g,'').replace(/\r\n?/g,'\n').split('\n');
    const indices=[];
    for(let i=0;i<lines.length;i++){
      const s = lines[i].trim(); if(!s) continue;
      const inc = R.inc.some(r=>r.test(s));
      const exc = R.exc && R.exc.test(s);
      if(inc && !exc) indices.push({ i:i, title:s });
    }
    if(!indices.length) return [{ title:'正文', body: raw }];
    const chapters=[];
    for(let k=0;k<indices.length;k++){
      const a=indices[k], b=indices[k+1];
      const from=a.i+1, to=b?b.i:lines.length;
      const body=lines.slice(from,to).join('\n').trim();
      chapters.push({ title:a.title, body:body });
    }
    return chapters;
  }
  function textToHtmlParagraphs(txt){
    if(!txt) return '<p></p>';
    const blocks = txt.replace(/\r\n?/g,'\n').split(/\n{2,}/);
    return blocks.map(function(block){
      const lines=block.split('\n');
      const safe=lines.map(l=>escapeHtml(l)).join('<br>');
      return '<p>'+safe+'</p>';
    }).join('\n');
  }

  /* ------------ 目录解析 & 插图（与在线阅读同款） ------------ */
  async function parseIndexVolumes(indexURL){
    const html = await gmFetchText(indexURL, { encoding: 'gb18030' });
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const volumes = [];
    const tables = Array.from(doc.querySelectorAll('#content table'));
    if (tables.length) {
      for (const tb of tables) {
        const prev = tb.previousElementSibling;
        const title = (prev ? prev.textContent : '').replace(/\s+/g,' ').trim();
        if (!title) continue;
        const vol = { title, cid: 0, chapters: [] };
        const links = Array.from(tb.querySelectorAll('a[href$=".htm"]'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/(\d+)\.htm$/); if (!m) continue;
          const cid = +m[1];
          const t = (a.textContent || '').replace(/\s+/g,' ').trim();
          if (/插图|插圖/.test(t)) vol.chapters.push({ title:'插图', cid: vol.cid });
          else{ vol.chapters.push({ title: t, cid }); if (!vol.cid && cid) vol.cid = cid; }
        }
        if (vol.chapters.length) volumes.push(vol);
      }
    } else {
      const trs = Array.from(doc.querySelectorAll('tr'));
      let current = null;
      for (const tr of trs) {
        const head = tr.querySelector('td.vcss[vid]');
        if (head) {
          if (current) volumes.push(current);
          current = { title:(head.textContent||'').replace(/\s+/g,' ').trim(), cid:+(head.getAttribute('vid')||0), chapters:[] };
          continue;
        }
        if (!current) continue;
        const links = Array.from(tr.querySelectorAll('a[href$=".htm"]'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/(\d+)\.htm$/); if (!m) continue;
          const cid = +m[1];
          const t = (a.textContent || '').replace(/\s+/g,' ').trim();
          if (/插图|插圖/.test(t)) current.chapters.push({ title:'插图', cid: current.cid });
          else current.chapters.push({ title: t, cid });
        }
      }
      if (current) volumes.push(current);
    }
    if (!volumes.length) throw new Error('未解析到卷信息（可能未登录）');
    return volumes;
  }
  async function fetchPackImagesByVol(aid, volCid){
    const candidates=[]; for (const host of WK_EPUB.DL_HOSTS) candidates.push(host+'/pack.php?aid='+aid+'&vid='+volCid);
    for (const host of WK_EPUB.DL_HOSTS) candidates.push(host+'/pack.php?aid='+aid+'&vid=0', host+'/pack.php?aid='+aid);
    const encs=['gb18030','utf-8'];
    for (const url of candidates){
      for (const enc of encs){
        try{
          const raw = await gmFetchText(url, { encoding: enc });
          const urls = extractAndSortImagesLocal(raw);
          if (urls.length) return urls;
        }catch(e){}
      }
    }
    return [];
  }
  async function collectAllImages({lib, aid}){
    try{
      const indexURL = 'https://www.wenku8.net/novel/'+lib+'/'+aid+'/index.htm';
      const vols = await parseIndexVolumes(indexURL);
      let all=[];
      for (const v of vols){ const arr = await fetchPackImagesByVol(aid, v.cid); all = all.concat(arr); }
      return Array.from(new Set(all));
    }catch(e){ return []; }
  }

  /* ------------ 构建 EPUB（本地TXT） ------------ */
  async function buildEPUBFromLocal({bookTitle, txtName, wholeText, coverFile, rules}){
    const overlayCtl = overlay();
    overlayCtl.set('构建EPUB', '拆分章节…', 0.10, txtName||'');

    let chapters = splitByHeadingRules(wholeText, rules);
    overlayCtl.set('构建EPUB', `找到章节：${chapters.length}`, 0.16);

    const JSZipCtor = await loadJSZip();
    const zip = new JSZipCtor();
    zip.file('mimetype', 'application/epub+zip', {compression:'STORE'});
    zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>');
    const oebps = zip.folder('OEBPS');
    oebps.folder('styles').file('style.css', '/* Generated */\n'+EPUB_CSS);

    const htmlPaths=[];
    for (let i=0;i<chapters.length;i++){
      const c = chapters[i];
      const fname = 'text/c'+(i+1).toString().padStart(5,'0')+'.xhtml';
      const title = c.title || ('章节 '+(i+1));
      const html = '<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">\n<head><meta charset="utf-8"/><title>'+escapeHtml(title)+'</title><link rel="stylesheet" href="../styles/style.css"/></head>\n<body><h1>'+escapeHtml(title)+'</h1>'+textToHtmlParagraphs(c.body)+'</body></html>';
      oebps.file(fname, html);
      htmlPaths.push({ id:'chap-'+(i+1), href:fname, title:title });
      if(i%10===0) overlayCtl.set('构建EPUB', '写入章节 '+(i+1)+'/'+chapters.length, 0.16 + 0.60*(i/Math.max(1,chapters.length)));
      await sleep(1);
    }

    let coverMeta = null;
    if (coverFile){
      try{
        const buf = new Uint8Array(await coverFile.arrayBuffer());
        const ext = (coverFile.name.split('.').pop()||'jpg').toLowerCase();
        const mime = MIME[ext] || coverFile.type || 'image/jpeg';
        const images = oebps.folder('images');
        images.file('cover.'+ext, buf);
        coverMeta = { id:'cover-image', href:'images/cover.'+ext, media:mime };
      }catch(e){ console.warn('[EPUB] 封面处理失败', e); }
    }

    const tocTree = [];
    let currentParent = null;
    for (const p of htmlPaths) {
        if (currentParent && p.title.startsWith(currentParent.title) && p.title.length > currentParent.title.length && p.title !== currentParent.title) {
            if (!currentParent.children) currentParent.children = [];
            currentParent.children.push(p);
        } else {
            currentParent = { ...p, children: [] };
            tocTree.push(currentParent);
        }
    }
    function renderNavNode(node) {
        let s = '<li><a href="'+node.href+'">'+escapeHtml(node.title)+'</a>';
        if (node.children && node.children.length > 0) {
            s += '\n<ol>\n' + node.children.map(renderNavNode).join('\n') + '\n</ol>\n';
        }
        s += '</li>';
        return s;
    }
    const navItemsHtml = tocTree.map(renderNavNode).join('\n');
    const navHtml = '<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">\n<head><meta charset="utf-8"/><title>目录</title><link rel="stylesheet" href="styles/style.css"/></head>\n<body>\n  <nav epub:type="toc" id="toc">\n    <h1>目录</h1>\n    <ol>\n      '+navItemsHtml+'\n    </ol>\n  </nav>\n</body></html>';
    oebps.file('nav.xhtml', navHtml);

    const manifestItems = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>','<item id="css" href="styles/style.css" media-type="text/css"/>'];
    if (coverMeta) manifestItems.push('<item id="'+coverMeta.id+'" href="'+coverMeta.href+'" media-type="'+coverMeta.media+'" properties="cover-image"/>');
    for(const p of htmlPaths) manifestItems.push('<item id="'+p.id+'" href="'+p.href+'" media-type="application/xhtml+xml"/>');
    const spineItems = htmlPaths.map(p=>'<itemref idref="'+p.id+'"/>').join('\n');

    const opf = '<?xml version="1.0" encoding="utf-8"?>\n<package version="3.0" unique-identifier="pub-id" xmlns="http://www.idpf.org/2007/opf">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="pub-id">urn:uuid:'+uuid()+'</dc:identifier>\n    <dc:title>'+escapeHtml(bookTitle||'Wenku8')+'</dc:title>\n    <dc:language>zh-CN</dc:language>\n    <dc:date>'+nowIso()+'</dc:date>\n    '+(coverMeta? '<meta name="cover" content="cover-image"/>' : '')+'\n  </metadata>\n  <manifest>\n    '+manifestItems.join('\n    ')+'\n  </manifest>\n  <spine>\n    '+spineItems+'\n  </spine>\n</package>';
    oebps.file('content.opf', opf);

    overlayCtl.set('打包', '生成EPUB…', 0.95);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    overlayCtl.close();

    const url = URL.createObjectURL(blob);
    const fileName = (safeName(bookTitle || 'Wenku8'))+'.epub';

    // Use GM_download for more reliable downloads
    if (typeof GM_download === 'function') {
      GM_download({
        url: url,
        name: fileName,
        saveAs: true, // Let user choose location
        onload: () => URL.revokeObjectURL(url),
        onerror: (err) => {
          console.error('GM_download failed:', err);
          fallbackDownload();
        }
      });
    } else {
      fallbackDownload();
    }

    function fallbackDownload() {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 30000);
    }
  }

  /* ------------ 步骤 2：封面上传 + 插图链接预览 ------------ */
  async function askCoverAndTitle({lib, aid, defaultBookTitle}){
    return new Promise((resolve)=>{
      const dlg = document.createElement('div');
      dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center';
      dlg.innerHTML = `<div style="width:min(1060px,96%);max-height:90%;overflow:auto;background:#111827;border:1px solid #334155;border-radius:16px;padding:16px;color:#e5e7eb; margin: auto;">
        <h3 style="margin:0 0 10px">步骤 3 / 3：设置书名与封面</h3>
        <div style="margin: 8px 0 16px;">
          <label for="wk_book_title" style="display:block; opacity:.9; margin-bottom: 6px; font-size: 14px;">EPUB 书名</label>
          <input id="wk_book_title" type="text" value="${escapeHtml(defaultBookTitle)}" style="width: 98%; border-radius:10px; border:1px solid #334155; background:#0b1220; color:#e5e7eb; padding:10px; font-size: 14px;">
        </div>
        <div style="opacity:.9; margin-top: 16px; border-top: 1px solid #334155; padding-top: 16px;">
          <p style="margin-top:0"><b>可选：</b>上传封面图片，封面会内嵌进 EPUB。</p>
          <input id="wk_cover_file" type="file" accept="image/*" style="margin:8px 0"/>
          <div id="wk_cover_name" style="font-size:12px;opacity:.8;margin-bottom:10px"></div>
        </div>
        <details open style="margin:8px 0 12px"><summary style="cursor:pointer">预览插图链接（仅供手动下载封面参考）</summary>
        <div id="wk_img_preview" style="margin-top:10px">加载中…</div>
        <div style="font-size:12px;opacity:.8;margin-top:4px">提示：这些链接通常需登录/带Referer，建议右键另存到本地后再上传为封面。EPUB 内不会插入任何外链图片。</div>
        </details>
        <div style="display:flex;gap:10px;margin-top:10px"><button class="wk-btn" id="wk_cover_ok">开始生成 EPUB</button><button class="wk-btn" id="wk_cover_skip">跳过并生成</button><button class="wk-btn" id="wk_cover_cancel">退出</button></div>
        </div>`;
      document.body.appendChild(dlg);

      const fi = dlg.querySelector('#wk_cover_file');
      const nm = dlg.querySelector('#wk_cover_name');
      const titleInput = dlg.querySelector('#wk_book_title');
      let coverFile = null;
      fi.onchange = function(){ coverFile = (fi.files && fi.files[0]) || null; nm.textContent = coverFile ? ('已选择：'+coverFile.name+'（'+(coverFile.size/1024).toFixed(0)+'KB）') : ''; };

      (async function(){
        const box = dlg.querySelector('#wk_img_preview');
        try{
          const imgs = await collectAllImages({lib:lib, aid:aid});
          if(!imgs.length){ box.textContent='未解析到插图链接（可能需要登录，或本书无插图）'; return; }
          box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">'
            + imgs.slice(0,240).map(function(u,i){
                return '<a href="'+u+'" target="_blank" rel="noopener" style="display:block;border:1px solid #334155;border-radius:10px;padding:6px">'
                     + '<img loading="lazy" src="'+u+'" style="width:100%;height:auto;border-radius:6px;display:block">'
                     + '<div style="font-size:11px;opacity:.75;margin-top:4px;word-break:break-all">'+(i+1)+'. '+u+'</div></a>';
              }).join('')
            + '</div>';
        }catch(e){ box.textContent='加载失败：'+(e && e.message ? e.message : String(e)); }
      })();

      const getResult = (file) => ({
        coverFile: file,
        bookTitle: (titleInput.value || defaultBookTitle).trim()
      });

      dlg.querySelector('#wk_cover_ok').onclick = function(){ dlg.remove(); resolve(getResult(coverFile)); };
      dlg.querySelector('#wk_cover_skip').onclick = function(){ dlg.remove(); resolve(getResult(null)); };
      dlg.querySelector('#wk_cover_cancel').onclick = function(){ dlg.remove(); resolve('__CANCEL__'); };
    });
  }

  /* ------------ 构建器：三步向导 ------------ */
  async function startLocalEPUBWizard({lib, aid}){
    const local = await openTxtPicker();
    if(!local) return;

    const rules = loadTocRules();
    const r = await openRuleEditor({ rules, wholeText: local.text });
    if (!r) return;
    Object.assign(rules, r);

    const defaultBookTitle = document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : 'Wenku8Book';
    const result = await askCoverAndTitle({lib:lib, aid:aid, defaultBookTitle: defaultBookTitle});
    if(result === '__CANCEL__') return;

    const { coverFile, bookTitle } = result;

    await buildEPUBFromLocal({
      bookTitle: bookTitle,
      txtName: local.name,
      wholeText: local.text,
      coverFile: coverFile,
      rules: rules
    });
  }

function openRuleEditor({ rules, wholeText }) {
  return new Promise(resolve => {
    const candidates = extractCandidateHeadings(wholeText);
    const sample = wholeText.split(/\n/).slice(0, 20000).join('\n'); // Increased sample size

    const m = document.createElement('div');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center';
    m.innerHTML = `
      <div style="width:min(1200px,96%);max-height:92%;overflow:hidden;background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.45);display:flex;flex-direction:column; margin: auto;"> <div style="padding:14px 16px;border-bottom:1px solid #334155;font-weight:600">步骤 2 / 3：目录规则</div>
        <div style="display:grid;grid-template-columns:1.1fr 1fr 1.2fr;gap:14px; padding:14px; overflow:auto">
          <div>
            <div style="font-size:12px;opacity:.85;margin-bottom:6px">包含（每行一条规则，匹配的行会成为章节标题）</div>
            <textarea id="wk_rule_inc" style="width:100%;height:180px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;padding:10px">${(rules.includes||[]).join('\n')}</textarea>
            <div style="margin:8px 0 6px;font-size:12px;opacity:.85">排除（匹配的行将被忽略）</div>
            <input id="wk_rule_exc" style="width:100%;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;padding:10px" value="${rules.exclude||''}">
            <div style="margin-top:14px; padding:10px; border: 1px solid #2563eb; border-radius: 10px; background: #1e293b; font-size:13px; line-height: 1.6;">
              <h4 style="margin:0 0 8px; color:#93c5fd;">小白操作指南</h4>
              <p style="margin:0 0 4px;">遇到无法识别的标题（比如“特典”），按下面步骤操作：</p>
              <ol style="margin:0; padding-left: 20px;">
                <li>在中间的输入框里粘贴标题原文，如“特典”。</li>
                <li>点击旁边的【➕ 加到包含】按钮。</li>
                <li>规则会自动添加并生效，右侧预览会同步更新。</li>
              </ol>
              <p style="margin:8px 0 0;">规则会自动保存，下次制作时无需重复操作。</p>
            </div>
          </div>
          <div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
              <input id="wk_quick_input" placeholder="把标题原文粘贴到这里" style="flex:1;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;padding:8px">
            </div>
            <div style="display:flex;gap:6px;margin-bottom:10px">
              <button id="wk_quick_add_inc" class="wk-btn">➕ 加到包含</button>
              <button id="wk_quick_add_exc" class="wk-btn">➖ 加到排除</button>
            </div>
            <div style="font-weight:600;margin:6px 0 6px;display:flex;justify-content:space-between;align-items:center">
              <span>✅ 已命中标题（点击可加入排除）</span>
              <button id="wk_rule_refresh" class="wk-btn tiny">刷新</button>
            </div>
            <div id="wk_list_hit" style="max-height:380px;overflow:auto;border:1px solid #334155;border-radius:10px;padding:8px;background:#0b1220"></div>
          </div>
          <div class="min-width-300px" style="min-width:300px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-weight:600" id="wk_preview_title">切分预览</div>
              <button id="wk_rule_ok" class="wk-btn">继续</button>
            </div>
            <div id="wk_rule_preview" style="font-size:14px;line-height:1.6;max-height:520px;overflow:auto;border:1px solid #334155;border-radius:10px;padding:10px;background:#0b1220"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button id="wk_rule_cancel" class="wk-btn">取消</button>
              <button id="wk_rule_reset" class="wk-btn">恢复默认规则</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);

    const $inc = m.querySelector('#wk_rule_inc');
    const $exc = m.querySelector('#wk_rule_exc');
    const $hit = m.querySelector('#wk_list_hit');
    const $pv  = m.querySelector('#wk_rule_preview');
    const $qi  = m.querySelector('#wk_quick_input');
    const $refreshBtn = m.querySelector('#wk_rule_refresh');
    const $previewTitle = m.querySelector('#wk_preview_title');

    function renderChipList(box, arr, { action, title }) {
      box.innerHTML = '';
      if (!arr.length) { box.innerHTML = `<div style="opacity:.6;font-size:12px">（无）</div>`; return; }
      const frag = document.createDocumentFragment();
      arr.slice(0, 1000).forEach(s => { // Still limit display for performance
        const b = document.createElement('button');
        b.className = 'wk-btn tiny';
        b.style.cssText = 'margin:4px 6px 4px 0;padding:4px 8px;font-size:12px;border-radius:8px';
        b.textContent = s; b.title = title;
        b.addEventListener('click', () => action(s));
        frag.appendChild(b);
      });
      if (arr.length > 1000) {
        const t = document.createElement('div');
        t.style.cssText = 'opacity:.6;font-size:12px;margin-top:4px';
        t.textContent = `（仅显示前 1000 项，共 ${arr.length} 项）`;
        frag.appendChild(t);
      }
      box.appendChild(frag);
    }

    function recomputeAll() {
      const cur = { includes: toLinesDistinct($inc.value), exclude: String($exc.value||'').trim() };
      const { hit, miss } = classifyCandidates(candidates, cur); // Gets hits/misses in original order

      renderChipList($hit, hit, { // Renders hits in original order
        title: '点击把该标题加入“排除”',
        action: (s) => {
          const part = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const now = String($exc.value || '').trim();
          const next = now ? `${now}|${part}` : part;
          $exc.value = next;
          recomputeAll();
        }
      });

      const previewRules = { includes: toLinesDistinct($inc.value), exclude: String($exc.value||'').trim() };
      const tmpCh = splitByHeadingRules(sample, previewRules);
      const html = tmpCh.map(ch => `<h3 style="margin:.8em 0 .4em">${escapeHtml(ch.title)}</h3><p style="opacity:.85">${escapeHtml((ch.body||'').slice(0,160))}${(ch.body||'').length>160?'…':''}</p>`).join('');
      $pv.innerHTML = html || '<div class="muted">(尚无匹配结果)</div>';
      $previewTitle.textContent = `切分预览（基于前 ${sample.split('\n').length} 行）`;
    }

    async function quickAdd(to = 'inc') {
      const lines = toLinesDistinct($qi.value);
      if (!lines.length) return;
      if (to === 'inc') {
        const regs = lines.map(makeFlexibleTitleRegex);
        $inc.value = linesToText([...toLinesDistinct($inc.value), ...regs]);
      } else {
        const esc = lines.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const now = String($exc.value||'').trim();
        const next = now ? `${now}|${esc.join('|')}` : esc.join('|');
        $exc.value = next;
      }
      $qi.value = '';
      await sleep(0); // Ensure UI updates before recompute
      recomputeAll();
    }

    m.querySelector('#wk_quick_add_inc').onclick = () => quickAdd('inc');
    m.querySelector('#wk_quick_add_exc').onclick = () => quickAdd('exc');
    $refreshBtn.onclick = recomputeAll;
    $inc.addEventListener('input', recomputeAll);
    $exc.addEventListener('input', recomputeAll);

    m.querySelector('#wk_rule_ok').onclick = () => {
      const includes = toLinesDistinct($inc.value);
      const exclude  = String($exc.value||'').trim();
      saveTocRules({ includes, exclude }); // Save final rules to v3 key
      m.remove();
      resolve({ includes, exclude });
    };
    m.querySelector('#wk_rule_cancel').onclick = () => { m.remove(); resolve(null); };

    // ========== RESET FIX START: Clear storage on reset ==========
    m.querySelector('#wk_rule_reset').onclick  = () => {
      try { localStorage.removeItem(WK_EPUB.TOC_LS_KEY); } // Clear v3 storage
      catch(e) { console.error("Failed to remove TOC rules from localStorage", e); }
      const def = loadTocRules(); // Load defaults (storage is clear)
      $inc.value = (def.includes||[]).join('\n');
      $exc.value = def.exclude||'';
      recomputeAll(); // Update UI
    };
    // ========== RESET FIX END ==========

    recomputeAll(); // Initial render
  });
}


  /* ------------ 注入按钮 ------------ */
  function ensureButtons(){
    const bar = document.querySelector('header .bar') || document.querySelector('.bar');
    const btnDownVol = document.getElementById('btnDownVol');
    if (!bar || !btnDownVol) return false;
    if (document.getElementById('wk_epub_local_btn')) return true;

    const mk = function(id, text){ const b=document.createElement('button'); b.className='wk-btn'; b.id=id; b.textContent=text; return b; };
    const btnE = mk('wk_epub_local_btn','⇪ 本地TXT → EPUB');

    btnE.onclick = async function(){
      const idxEl = document.getElementById('btnIndex');
      const idxHref = idxEl ? idxEl.getAttribute('href') : '';
      let lib=0, aid=0;
      if(idxHref){
        const m = idxHref.match(/novel\/(\d+)\/(\d+)\/index\.htm$/); if(m){ lib=+m[1]; aid=+m[2]; }
      }else{
        const mPath = location.pathname.match(/novel\/(\d+)\/(\d+)\//); if(mPath){ lib=+mPath[1]; aid=+mPath[2]; }
        if (!aid) { const mBookPath = location.pathname.match(/\/book\/(\d+)\.htm$/); if (mBookPath) { aid = +mBookPath[1]; lib = 0; } }
      }
      if (!aid) {
        toast('未能解析书籍ID (aid)，无法启动EPUB向导。', 'error');
        return;
      }
      await startLocalEPUBWizard({lib:lib, aid:aid});
    };

    btnDownVol.insertAdjacentElement('afterend', btnE);
    return true;
  }

  const mo = new MutationObserver(function(){ try{ ensureButtons(); }catch(e){} });
  mo.observe(document.documentElement || document.body, {childList:true, subtree:true});
  try{ ensureButtons(); }catch(e){}
})();




