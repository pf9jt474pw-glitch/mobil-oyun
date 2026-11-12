(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const audio = $('audio');

  // ---------- Yardımcılar ----------
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const norm = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = s => (String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?').toLocaleUpperCase('tr');
  function artHTML(name, img) {
    const h = hue(name);
    const bg = `background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 50) % 360} 65% 38%))`;
    const fallback = `<span>${esc(initials(name))}</span>`;
    if (img && /^https:\/\//.test(img)) return { style: bg, html: fallback + `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` };
    return { style: bg, html: fallback };
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('melodim_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('melodim_' + k, JSON.stringify(v)); } catch {} },
  };
  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ---------- Veritabanı (şarkılar cihazda saklanır) ----------
  let dbp;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('melodim', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('tracks', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('tracks', mode); const s = t.objectStore('tracks');
      const out = fn(s); t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error);
    });
  }
  const dbAll = () => tx('readonly', s => s.getAll());
  const dbPut = rec => tx('readwrite', s => s.put(rec));
  const dbDel = id => tx('readwrite', s => s.delete(id));
  const dbGet = id => tx('readonly', s => s.get(id));
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}

  // ---------- Yerel (Android/iOS) entegrasyon ----------
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const platform = Cap && Cap.getPlatform ? Cap.getPlatform() : 'web';
  const Plugins = (Cap && Cap.Plugins) || {};
  const NativeMedia = platform === 'android' ? Plugins.MediaService : null;


  // ---------- Durum ----------
  let tracks = [];            // kitaplık (blob olmadan)
  let shuffle = store.get('shuffle', false);
  let repeat = store.get('repeat', 'off'); // off | all | one
  let cur = null;             // { kind:'track', id, title, artist }
  let queue = [];             // şarkı kimlikleri
  let qi = -1;
  let objectUrl = null;
  let sleepEnd = 0;
  let wantPlaying = false;

  // ---------- Kitaplık ----------
  function parseName(fileName) {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.\-]+/, '').trim();
    const m = base.split(/\s+[-–—]\s+/);
    if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() };
    return { artist: 'Bilinmeyen sanatçı', title: base || fileName };
  }
  function getDuration(blob) {
    return new Promise(res => {
      const a = new Audio(); const u = URL.createObjectURL(blob);
      const done = d => { URL.revokeObjectURL(u); res(d); };
      a.preload = 'metadata'; a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => done(0); setTimeout(() => done(0), 8000); a.src = u;
    });
  }
  async function addFiles(files) {
    const list = [...files].filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name));
    if (!list.length) { toast('Ses dosyası seçilmedi'); return; }
    let n = 0;
    for (const f of list) {
      $('libStatus').textContent = `Ekleniyor ${++n}/${list.length}: ${f.name}`;
      const { artist, title } = parseName(f.name);
      const duration = await getDuration(f);
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title, artist, duration, added: Date.now(), blob: f, name: f.name };
      try { await dbPut(rec); } catch (e) { toast('Kaydedilemedi: ' + f.name + ' (depolama dolu olabilir)'); break; }
    }
    await loadLibrary();
    toast(`${n} şarkı eklendi`);
  }
  async function loadLibrary() {
    const all = await dbAll();
    tracks = all.map(({ blob, ...r }) => r).sort((a, b) => a.artist.localeCompare(b.artist, 'tr') || a.title.localeCompare(b.title, 'tr'));
    renderLibrary(); renderPlaylist();
  }
  function filteredTracks() {
    const q = norm($('libSearch').value.trim());
    return q ? tracks.filter(t => norm(t.title + ' ' + t.artist).includes(q)) : tracks;
  }
  function renderLibrary() {
    const list = filteredTracks();
    $('libActions').classList.toggle('hidden', !tracks.length);
    $('libStatus').textContent = tracks.length ? `${tracks.length} şarkı` + (list.length !== tracks.length ? ` · ${list.length} sonuç` : '') : '';
    if (!tracks.length) {
      $('libList').innerHTML = `<div class="empty"><b>Kitaplığın boş</b>Telefonundaki müzik dosyalarını eklemek için <b style="display:inline;color:var(--accent)">+ Ekle</b>'ye dokun. Şarkılar uygulamanın içine kaydedilir; reklam yok, ekran kapalıyken de çalar.</div>`;
      return;
    }
    if (!list.length) { $('libList').innerHTML = '<div class="empty">Eşleşen şarkı yok.</div>'; return; }
    $('libList').innerHTML = list.map(t => {
      const a = artHTML(t.artist);
      const on = cur && cur.kind === 'track' && cur.id === t.id;
      return `<div class="row${on ? ' playing' : ''}" data-id="${t.id}">
        <div class="art" style="${a.style}">${a.html}</div>
        <button class="meta" data-play="${t.id}"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.artist)}</div></button>
        <span class="dur">${fmt(t.duration)}</span>
        <button class="row-act" data-del="${t.id}" aria-label="Sil">${ICON_DEL}</button></div>`;
    }).join('');
  }
  $('libList').addEventListener('click', async e => {
    const p = e.target.closest('[data-play]'), d = e.target.closest('[data-del]');
    if (p) { const ids = filteredTracks().map(t => t.id); playQueue(ids, ids.indexOf(p.dataset.play)); }
    if (d) {
      const id = d.dataset.del, t = tracks.find(x => x.id === id);
      if (d.dataset.confirm !== '1') { d.dataset.confirm = '1'; d.style.color = 'var(--danger)'; toast(`"${t.title}" silmek için tekrar dokun`); setTimeout(() => { d.dataset.confirm = ''; d.style.color = ''; }, 3000); return; }
      await dbDel(id); queue = queue.filter(x => x !== id);
      if (cur && cur.id === id) { stopAll(); }
      await loadLibrary(); toast('Silindi');
    }
  });
  $('addBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = e => { const f = e.target.files; if (f && f.length) addFiles(f); e.target.value = ''; };
  $('libSearch').oninput = renderLibrary;
  $('playAllBtn').onclick = () => { shuffle = false; saveModes(); const ids = filteredTracks().map(t => t.id); playQueue(ids, 0); };
  $('shuffleAllBtn').onclick = () => { shuffle = true; saveModes(); const ids = filteredTracks().map(t => t.id); playQueue(ids, Math.floor(Math.random() * ids.length)); };

  // ---------- Çalma ----------
  function playQueue(ids, index) {
    if (!ids.length || index < 0) return;
    queue = ids.slice(); qi = index; playTrackAt(qi);
  }
  async function playTrackAt(i, startAt = 0, autoplay = true) {
    const id = queue[i]; if (!id) return;
    const rec = await dbGet(id);
    if (!rec) { toast('Şarkı bulunamadı'); return next(); }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(rec.blob);
    cur = { kind: 'track', id, title: rec.title, artist: rec.artist };
    audio.src = objectUrl;
    if (startAt) audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = startAt; } catch {} }, { once: true });
    updateUI(); renderLibrary(); renderPlaylist();
    if (autoplay) await doPlay();
  }
  async function doPlay() {
    wantPlaying = true;
    try { await audio.play(); return true; }
    catch (e) {
      if (e && e.name === 'NotAllowedError') toast('Çalmaya başlamak için ▶ düğmesine dokun');
      wantPlaying = false; updateUI(); return false;
    }
  }
  function pause() { wantPlaying = false; audio.pause(); }
  function toggle() {
    if (!cur) { if (tracks.length) playQueue(tracks.map(t => t.id), 0); else $('fileInput').click(); return; }
    if (audio.paused) doPlay(); else pause();
  }
  function stopAll() {
    pause(); audio.removeAttribute('src'); audio.load(); cur = null; queue = []; qi = -1;
    if (NativeMedia) NativeMedia.stop().catch(() => {});
    updateUI(); renderLibrary(); renderPlaylist();
  }
  function nextIndex(dir) {
    if (!queue.length) return -1;
    if (shuffle && queue.length > 1) { let r; do { r = Math.floor(Math.random() * queue.length); } while (r === qi); return r; }
    const n = qi + dir;
    if (n >= queue.length) return repeat === 'all' ? 0 : -1;
    if (n < 0) return repeat === 'all' ? queue.length - 1 : 0;
    return n;
  }
  function next() {
    if (!cur) return;
    const n = nextIndex(1); if (n < 0) { pause(); audio.currentTime = 0; return; }
    qi = n; playTrackAt(qi);
  }
  function prev() {
    if (!cur) return;
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    const n = nextIndex(-1); if (n < 0) return; qi = n; playTrackAt(qi);
  }

  audio.addEventListener('ended', () => {
    if (repeat === 'one' && cur && cur.kind === 'track') { audio.currentTime = 0; doPlay(); }
    else next();
  });
  audio.addEventListener('play', () => { updateUI(); });
  audio.addEventListener('pause', () => { updateUI(); saveResume(); });
  audio.addEventListener('error', () => {
    if (!cur || !audio.getAttribute('src') || !audio.error) return;
    toast('Bu dosya çalınamadı, sonrakine geçiliyor'); setTimeout(next, 800);
  });
  let lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    if (sleepEnd && Date.now() >= sleepEnd) { sleepEnd = 0; pause(); toast('Uyku zamanlayıcısı: müzik durduruldu'); renderSleep(); }
    updateProgress();
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); saveResume(); }
  });

  // ---------- Kaldığın yerden devam ----------
  function saveResume() {
    if (!cur) { store.set('resume', null); return; }
    store.set('resume', { kind: 'track', queue, qi, pos: audio.currentTime || 0 });
  }
  async function resume() {
    const r = store.get('resume', null);
    const auto = store.get('autoplay', true);
    if (!r) return;
    if (r.kind === 'track' && Array.isArray(r.queue)) {
      const ids = new Set(tracks.map(t => t.id));
      queue = r.queue.filter(id => ids.has(id)); if (!queue.length) return;
      qi = Math.min(Math.max(0, r.qi), queue.length - 1);
      await playTrackAt(qi, r.pos || 0, auto);
    }
  }

  // ---------- Arayüz güncelleme ----------
  function curInfo() {
    if (!cur) return null;
    return { title: cur.title, sub: cur.artist, art: artHTML(cur.artist), live: false, source: 'Kitaplığım' };
  }
  function updateUI() {
    const info = curInfo(); const playing = !audio.paused;
    $('mini').classList.toggle('hidden', !info);
    $('miniPlay').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    $('bigPlay').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    $('shuffleBtn').classList.toggle('on', shuffle);
    $('repeatBtn').classList.toggle('on', repeat !== 'off');
    $('repeatBtn').setAttribute('aria-label', repeat === 'one' ? 'Tekrar: tek şarkı' : repeat === 'all' ? 'Tekrar: tümü' : 'Tekrar: kapalı');
    $('repeatBtn').style.position = 'relative';
    $('repeatBtn').dataset.one = repeat === 'one' ? '1' : '';
    if (info) {
      for (const el of [$('miniArt'), $('fullArt')]) { el.setAttribute('style', info.art.style); el.innerHTML = info.art.html; }
      $('miniTitle').textContent = info.title; $('miniSub').textContent = info.sub;
      $('fullTitle').textContent = info.title; $('fullSub').textContent = info.sub; $('fullSource').textContent = info.source;
    }
    syncMediaSession(info, playing);
  }
  function updateProgress() {
    const d = audio.duration, c = audio.currentTime;
    const live = !cur || !isFinite(d);
    $('miniBar').style.width = live ? '0' : (c / d * 100) + '%';
    if (!live && !seeking) { $('seek').value = Math.round(c / d * 1000); $('tCur').textContent = fmt(c); $('tDur').textContent = fmt(d); }
  }
  let seeking = false;
  $('seek').addEventListener('input', () => { seeking = true; $('tCur').textContent = fmt($('seek').value / 1000 * audio.duration); });
  $('seek').addEventListener('change', () => { if (isFinite(audio.duration)) audio.currentTime = $('seek').value / 1000 * audio.duration; seeking = false; });

  // ---------- Kilit ekranı / bildirim kontrolleri ----------
  let lastNative = '';
  function syncMediaSession(info, playing) {
    if (NativeMedia) {
      if (!info) return;
      const payload = { title: info.title, artist: info.sub || '', playing, live: info.live };
      const key = JSON.stringify(payload);
      if (key !== lastNative && (playing || lastNative)) { lastNative = key; NativeMedia.update(payload).catch(() => {}); }
      return;
    }
    if (!('mediaSession' in navigator)) return;
    try {
      if (info) navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.sub, album: 'Melodim' });
      navigator.mediaSession.playbackState = info ? (playing ? 'playing' : 'paused') : 'none';
    } catch {}
  }
  if ('mediaSession' in navigator) {
    const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
    h('play', () => { if (audio.paused) toggle(); });
    h('pause', () => pause());
    h('nexttrack', () => next());
    h('previoustrack', () => prev());
    h('seekto', d => { if (cur && cur.kind === 'track' && d.seekTime != null) audio.currentTime = d.seekTime; });
  }
  if (NativeMedia) {
    NativeMedia.addListener('action', ({ action }) => {
      if (action === 'play') { if (audio.paused) toggle(); }
      else if (action === 'pause') pause();
      else if (action === 'next') next();
      else if (action === 'prev') prev();
      else if (action === 'stop') { pause(); NativeMedia.stop().catch(() => {}); lastNative = ''; }
    });
  }

  // ---------- Kontroller ----------
  const saveModes = () => { store.set('shuffle', shuffle); store.set('repeat', repeat); updateUI(); };
  $('miniPlay').onclick = toggle;
  $('bigPlay').onclick = toggle;
  $('nextBtn').onclick = next;
  $('prevBtn').onclick = prev;
  $('shuffleBtn').onclick = () => { shuffle = !shuffle; saveModes(); toast(shuffle ? 'Karışık çalma açık' : 'Karışık çalma kapalı', 1400); };
  $('repeatBtn').onclick = () => { repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off'; saveModes(); toast({ off: 'Tekrar kapalı', all: 'Tümünü tekrarla', one: 'Bu şarkıyı tekrarla' }[repeat], 1400); };
  const openFull = () => { $('full').classList.add('open'); $('full').setAttribute('aria-hidden', 'false'); };
  const closeFull = () => { $('full').classList.remove('open'); $('full').setAttribute('aria-hidden', 'true'); };
  $('miniMeta').onclick = openFull; $('miniArt').onclick = openFull; $('closeFull').onclick = closeFull;

  // Uyku zamanlayıcısı
  let sleepT = null;
  function renderSleep() {
    const on = sleepEnd > Date.now();
    $('sleepBtn').classList.toggle('on', on); $('sleepBtn2').classList.toggle('on', on);
    $('sleepInfo').textContent = on ? `Müzik ${new Date(sleepEnd).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' })} saatinde duracak.` : 'Seçtiğin süre sonunda müzik kendiliğinden durur.';
  }
  const openSheet = () => { renderSleep(); $('sheet').classList.remove('hidden'); };
  $('sleepBtn').onclick = openSheet; $('sleepBtn2').onclick = openSheet;
  $('sheet').addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (b) {
      const m = +b.dataset.min; clearTimeout(sleepT);
      sleepEnd = m ? Date.now() + m * 60000 : 0;
      if (m) { sleepT = setTimeout(() => { if (sleepEnd && Date.now() >= sleepEnd - 1000) { sleepEnd = 0; pause(); renderSleep(); } }, m * 60000); toast(`${m} dakika sonra duracak`); }
      else toast('Uyku zamanlayıcısı kapatıldı');
      renderSleep();
    }
    if (b || e.target.id === 'sheet') $('sheet').classList.add('hidden');
  });

  // Sekmeler
  function switchTab(t) {
    if (t !== 'list') t = 'lib';
    for (const [tab, view, id] of [['tabLib', 'libView', 'lib'], ['tabList', 'listView', 'list']]) {
      $(tab).classList.toggle('on', t === id); $(view).classList.toggle('hidden', t !== id);
    }
    if (t === 'list') renderPlaylist();
    store.set('tab', t);
  }
  $('tabLib').onclick = () => switchTab('lib');
  $('tabList').onclick = () => switchTab('list');

  // ---------- Listem (Spotify'dan aktarılan şarkı listesi) ----------
  const LIST = (window.MELODIM_LISTS || [])[0] || null;
  let plFilter = 'all';
  const clean = s => norm(String(s || '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft)\.?\b.*$/i, ' ')).replace(/[^a-z0-9çğöşü ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function matchTrack(item) {
    const ti = clean(item.title); if (!ti) return null;
    const artists = item.artist.split(',').map(clean).filter(Boolean);
    let best = null;
    for (const t of tracks) {
      const lt = clean(t.title), la = clean(t.artist), whole = clean(t.name || (t.artist + ' ' + t.title));
      const titleOk = lt === ti || (ti.length > 3 && (lt.includes(ti) || whole.includes(ti))) || (lt.length > 3 && ti.includes(lt));
      if (!titleOk) continue;
      const artistOk = artists.some(a => la.includes(a) || a.includes(la) || whole.includes(a));
      if (artistOk) return t;
      if (!best && /bilinmeyen/.test(la)) best = t; // dosya adında sanatçı yoksa yalnızca şarkı adıyla eşleştir
    }
    return best;
  }
  function plRows() {
    if (!LIST) return [];
    const q = norm($('plSearch').value.trim());
    return LIST.tracks.map(it => ({ it, m: matchTrack(it) }))
      .filter(r => plFilter === 'all' || (plFilter === 'have' ? r.m : !r.m))
      .filter(r => !q || norm(r.it.title + ' ' + r.it.artist).includes(q));
  }
  function renderPlaylist() {
    if (!LIST || $('listView').classList.contains('hidden')) return;
    const all = LIST.tracks.map(it => matchTrack(it));
    const have = all.filter(Boolean).length;
    $('plName').textContent = LIST.name;
    $('plStats').textContent = `${LIST.tracks.length} şarkı · ${have} tanesi kitaplığında`;
    $('plActions').classList.toggle('hidden', !have);
    const rows = plRows();
    const hint = have === LIST.tracks.length ? '' : `<div class="hint"><b>Spotify şarkıların sesini vermiyor, sadece adlarını.</b> Bir şarkının Melodim'de reklamsız ve arka planda çalması için o şarkının dosyası telefonunda (Dosyalar uygulamasında) olmalı. Dosyayı ekleyince buradaki yeşil düğme turuncu <b>Çal</b> düğmesine dönüşür.<div style="margin-top:10px"><button class="btn primary" id="plAdd">+ Şarkı dosyası ekle</button></div></div>`;
    if (!rows.length) { $('plList').innerHTML = hint + '<div class="empty">Bu filtrede şarkı yok.</div>'; return; }
    $('plList').innerHTML = hint + rows.map(({ it, m }) => {
      const a = artHTML(it.artist.split(',')[0]);
      const on = m && cur && cur.kind === 'track' && cur.id === m.id;
      const act = m
        ? `<button class="tag have" data-plplay="${m.id}">Çal</button>`
        : `<button class="tag sp" data-spid="${esc(it.id)}">Spotify'da aç</button>`;
      return `<div class="row${on ? ' playing' : ''}${m ? '' : ' dim'}">
        <div class="art" style="${a.style}">${a.html}</div>
        <div class="meta"><div class="t">${esc(it.title)}</div><div class="s">${esc(it.artist)}</div></div>
        ${act}</div>`;
    }).join('');
  }
  function plQueue() { return LIST ? LIST.tracks.map(matchTrack).filter(Boolean).map(t => t.id).filter((v, i, a) => a.indexOf(v) === i) : []; }
  $('plList').addEventListener('click', e => {
    if (e.target.closest('#plAdd')) { $('fileInput').click(); return; }
    const p = e.target.closest('[data-plplay]'), sp = e.target.closest('[data-spid]');
    if (p) { const ids = plQueue(); playQueue(ids, ids.indexOf(p.dataset.plplay)); }
    if (sp && sp.dataset.spid) {
      const url = 'https://open.spotify.com/track/' + sp.dataset.spid;
      if (isNative && Plugins.App) window.location.href = url; else window.open(url, '_blank', 'noopener');
    }
  });
  $('plFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-plf]'); if (!b) return;
    plFilter = b.dataset.plf;
    document.querySelectorAll('[data-plf]').forEach(c => c.classList.toggle('on', c === b));
    renderPlaylist();
  });
  $('plSearch').oninput = renderPlaylist;
  $('plPlay').onclick = () => { shuffle = false; saveModes(); const ids = plQueue(); playQueue(ids, 0); };
  $('plShuffle').onclick = () => { shuffle = true; saveModes(); const ids = plQueue(); playQueue(ids, Math.floor(Math.random() * ids.length)); };
  if (!LIST) $('tabList').classList.add('hidden');

  // ---------- Geri tuşu (Android) ----------
  if (Plugins.App) {
    try {
      Plugins.App.addListener('backButton', () => {
        if (!$('sheet').classList.contains('hidden')) $('sheet').classList.add('hidden');
        else if ($('full').classList.contains('open')) closeFull();
        else Plugins.App.minimizeApp ? Plugins.App.minimizeApp() : Plugins.App.exitApp(); // müzik arka planda devam etsin
      });
    } catch {}
  }
  if (isNative && Plugins.StatusBar) { try { Plugins.StatusBar.setStyle({ style: 'DARK' }); Plugins.StatusBar.setOverlaysWebView({ overlay: true }); } catch {} }
  window.addEventListener('pagehide', saveResume);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveResume(); });

  // ---------- Başlat ----------
  (async () => {
    try { await loadLibrary(); } catch { $('libStatus').textContent = 'Kitaplık açılamadı (tarayıcı depolaması kapalı olabilir).'; }
    switchTab(store.get('tab', 'lib'));
    updateUI();
    try { await resume(); } catch {}
  })();
})();
