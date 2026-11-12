'use strict';

// Müzik kaynağı: Audius (ücretsiz, anahtarsız, tam şarkı akışı sunan açık API)
const APP_NAME = 'MUZIK_PWA';
const API_CANDIDATES = ['https://api.audius.co'];
let apiBase = null;

const $ = (id) => document.getElementById(id);
const audio = $('audio');

const state = {
  queue: [],        // çalınan liste
  index: -1,
  shuffle: false,
  repeat: 'off',    // off | all | one
  favs: load('favs', []),
  localTracks: [],
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- API ----------
async function getApiBase() {
  if (apiBase) return apiBase;
  // Önce doğrudan ana adresi dene, olmazsa sunucu listesinden birini seç.
  for (const base of API_CANDIDATES) {
    try {
      const r = await fetch(`${base}/v1/tracks/trending?limit=1&app_name=${APP_NAME}`);
      if (r.ok) { apiBase = `${base}/v1`; return apiBase; }
    } catch {}
  }
  const r = await fetch('https://api.audius.co');
  const j = await r.json();
  const hosts = j.data || [];
  if (!hosts.length) throw new Error('Sunucu bulunamadı');
  apiBase = `${hosts[Math.floor(Math.random() * hosts.length)]}/v1`;
  return apiBase;
}

function toTrack(t) {
  const art = t.artwork || {};
  return {
    id: String(t.id),
    title: t.title,
    artist: (t.user && t.user.name) || 'Bilinmeyen sanatçı',
    duration: t.duration || 0,
    artwork: art['480x480'] || art['150x150'] || art['1000x1000'] || '',
    source: 'audius',
  };
}

async function searchTracks(q) {
  const base = await getApiBase();
  const url = `${base}/tracks/search?query=${encodeURIComponent(q)}&limit=40&app_name=${APP_NAME}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Arama başarısız');
  const j = await r.json();
  return (j.data || []).filter((t) => t.is_streamable !== false).map(toTrack);
}

function streamUrl(track) {
  if (track.source === 'local') return track.url;
  return `${apiBase}/tracks/${track.id}/stream?app_name=${APP_NAME}`;
}

// ---------- Liste çizimi ----------
function renderList(ul, tracks, { onPlay, showFav = true }) {
  ul.innerHTML = '';
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.key = keyOf(t);
    const img = t.artwork
      ? `<img src="${esc(t.artwork)}" alt="" loading="lazy">`
      : `<div class="ph">🎵</div>`;
    li.innerHTML = `
      ${img}
      <div class="meta">
        <div class="title">${esc(t.title)}</div>
        <div class="artist">${esc(t.artist)}</div>
      </div>
      <span class="dur">${t.duration ? fmt(t.duration) : ''}</span>
      ${showFav ? `<button class="icon fav ${isFav(t) ? 'on' : ''}" aria-label="Favori">${isFav(t) ? '♥' : '♡'}</button>` : ''}
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.fav')) { toggleFav(t); return; }
      onPlay(i);
    });
    ul.appendChild(li);
  });
  markPlaying();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const keyOf = (t) => `${t.source}:${t.id}`;

function markPlaying() {
  const cur = state.queue[state.index];
  const k = cur ? keyOf(cur) : '';
  document.querySelectorAll('.item').forEach((li) => {
    li.classList.toggle('playing', li.dataset.key === k);
  });
}

// ---------- Favoriler ----------
function isFav(t) { return state.favs.some((f) => keyOf(f) === keyOf(t)); }

function toggleFav(t) {
  if (t.source === 'local') return; // yerel dosyalar kalıcı saklanamaz
  if (isFav(t)) state.favs = state.favs.filter((f) => keyOf(f) !== keyOf(t));
  else state.favs.unshift(t);
  save('favs', state.favs);
  refreshFavUI();
}

function refreshFavUI() {
  document.querySelectorAll('.item').forEach((li) => {
    const btn = li.querySelector('.fav');
    if (!btn) return;
    const on = state.favs.some((f) => keyOf(f) === li.dataset.key);
    btn.classList.toggle('on', on);
    btn.textContent = on ? '♥' : '♡';
  });
  renderFavs();
  const cur = state.queue[state.index];
  const npFav = $('np-fav');
  const on = cur && isFav(cur);
  npFav.classList.toggle('on', !!on);
  npFav.textContent = on ? '♥' : '♡';
  npFav.style.visibility = cur && cur.source === 'local' ? 'hidden' : 'visible';
}

function renderFavs() {
  $('favs-empty').style.display = state.favs.length ? 'none' : 'block';
  renderList($('favs'), state.favs, {
    onPlay: (i) => playFrom([...state.favs], i),
  });
}

// ---------- Çalma ----------
async function playFrom(list, i) {
  state.queue = list;
  state.index = i;
  await startCurrent();
}

async function startCurrent() {
  const t = state.queue[state.index];
  if (!t) return;
  if (t.source !== 'local') await getApiBase();
  audio.src = streamUrl(t);
  updateNowPlaying(t);
  try {
    await audio.play();
  } catch (err) {
    console.warn('Oynatma hatası', err);
  }
}

function updateNowPlaying(t) {
  $('player').classList.remove('hidden');
  $('np-title').textContent = t.title;
  $('np-artist').textContent = t.artist;
  const art = $('np-art');
  if (t.artwork) { art.src = t.artwork; art.style.visibility = 'visible'; }
  else { art.removeAttribute('src'); art.style.visibility = 'hidden'; }
  document.title = `${t.title} – ${t.artist}`;
  markPlaying();
  refreshFavUI();

  // Kilit ekranı / bildirim kontrolleri
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: 'Müzik',
      artwork: t.artwork
        ? [{ src: t.artwork, sizes: '480x480', type: 'image/jpeg' }]
        : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}

function nextIndex(dir) {
  const n = state.queue.length;
  if (!n) return -1;
  if (state.shuffle && n > 1) {
    let r;
    do { r = Math.floor(Math.random() * n); } while (r === state.index);
    return r;
  }
  const j = state.index + dir;
  if (j >= n) return state.repeat === 'all' ? 0 : -1;
  if (j < 0) return state.repeat === 'all' ? n - 1 : 0;
  return j;
}

function next() {
  const j = nextIndex(1);
  if (j < 0) return;
  state.index = j;
  startCurrent();
}

function prev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const j = nextIndex(-1);
  if (j < 0) return;
  state.index = j;
  startCurrent();
}

function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

// ---------- Olaylar ----------
audio.addEventListener('play', () => {
  $('btn-play').textContent = '⏸';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  $('btn-play').textContent = '▶';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('ended', () => {
  if (state.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  next();
});
audio.addEventListener('error', () => {
  // Çalınamayan şarkıyı atla
  if (state.queue.length > 1) setTimeout(next, 800);
});

let seeking = false;
audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  $('t-cur').textContent = fmt(audio.currentTime);
  $('t-dur').textContent = fmt(d);
  if (!seeking && isFinite(d) && d > 0) $('seek').value = Math.round((audio.currentTime / d) * 1000);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(d) && d > 0) {
    try {
      navigator.mediaSession.setPositionState({
        duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate,
      });
    } catch {}
  }
});

const seek = $('seek');
seek.addEventListener('input', () => {
  seeking = true;
  const d = audio.duration;
  if (isFinite(d)) $('t-cur').textContent = fmt((seek.value / 1000) * d);
});
seek.addEventListener('change', () => {
  const d = audio.duration;
  if (isFinite(d)) audio.currentTime = (seek.value / 1000) * d;
  seeking = false;
});

$('btn-play').addEventListener('click', togglePlay);
$('btn-next').addEventListener('click', next);
$('btn-prev').addEventListener('click', prev);
$('btn-shuffle').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  $('btn-shuffle').classList.toggle('on', state.shuffle);
});
$('btn-repeat').addEventListener('click', () => {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  const b = $('btn-repeat');
  b.classList.toggle('on', state.repeat !== 'off');
  b.textContent = state.repeat === 'one' ? '🔂' : '🔁';
});
$('np-fav').addEventListener('click', () => {
  const t = state.queue[state.index];
  if (t) toggleFav(t);
});

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, h) => { try { ms.setActionHandler(a, h); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', prev);
  set('nexttrack', next);
  set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  set('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
  set('seekforward', (d) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10)); });
}

// Sekmeler
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'favs') renderFavs();
  });
});

// Arama
let lastResults = [];
$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (!q) return;
  $('search-input').blur();
  const status = $('status');
  status.style.display = 'block';
  status.textContent = 'Aranıyor…';
  $('results').innerHTML = '';
  try {
    lastResults = await searchTracks(q);
    if (!lastResults.length) { status.textContent = 'Sonuç bulunamadı.'; return; }
    status.style.display = 'none';
    renderList($('results'), lastResults, { onPlay: (i) => playFrom([...lastResults], i) });
  } catch (err) {
    apiBase = null;
    status.textContent = 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.';
  }
});

// Cihazdan dosya seçme
$('file-input').addEventListener('change', (e) => {
  const files = [...e.target.files];
  const added = files.map((f, i) => ({
    id: `${Date.now()}-${i}`,
    title: f.name.replace(/\.[^.]+$/, ''),
    artist: 'Cihazımdan',
    duration: 0,
    artwork: '',
    source: 'local',
    url: URL.createObjectURL(f),
  }));
  state.localTracks.push(...added);
  renderList($('local'), state.localTracks, {
    onPlay: (i) => playFrom([...state.localTracks], i),
    showFav: false,
  });
  e.target.value = '';
});

renderFavs();

// Uygulama olarak yüklenebilmesi için service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
