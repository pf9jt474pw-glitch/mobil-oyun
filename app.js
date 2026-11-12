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
  if (track.source === 'local' || track.source === 'radio') return track.url;
  return `${apiBase}/tracks/${track.id}/stream?app_name=${APP_NAME}`;
}

// ---------- Liste çizimi ----------
function renderList(ul, tracks, { onPlay, showFav = true, onDelete = null, ranked = false }) {
  ul.innerHTML = '';
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    li.dataset.key = keyOf(t);
    const img = t.artwork
      ? `<img src="${esc(t.artwork)}" alt="" loading="lazy">`
      : `<div class="ph">🎵</div>`;
    li.innerHTML = `
      ${ranked ? `<span class="rank">${i + 1}</span>` : ''}
      ${img}
      <div class="meta">
        <div class="title">${esc(t.title)}</div>
        <div class="artist">${esc(t.artist)}</div>
      </div>
      <span class="dur">${t.duration ? fmt(t.duration) : ''}</span>
      ${showFav ? `<button class="icon fav ${isFav(t) ? 'on' : ''}" aria-label="Favori">${isFav(t) ? '♥' : '♡'}</button>` : ''}
      ${onDelete ? `<button class="icon del" aria-label="Sil">🗑</button>` : ''}
    `;
    const im = li.querySelector('img');
    if (im) im.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'ph'; ph.textContent = '🎵';
      im.replaceWith(ph);
    }, { once: true });
    li.addEventListener('click', (e) => {
      if (e.target.closest('.fav')) { toggleFav(t); return; }
      if (e.target.closest('.del')) { onDelete(t); return; }
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
  if (t.source === 'audius') await getApiBase();
  if (t.source === 'radio') countRadioClick(t);
  radioErrors = t.source === 'radio' ? radioErrors : 0;
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
  art.onerror = () => { art.onerror = null; art.src = 'icons/icon-192.png'; };
  if (t.artwork) { art.src = t.artwork; art.style.visibility = 'visible'; }
  else { art.removeAttribute('src'); art.style.visibility = 'hidden'; }
  document.title = `${t.title} – ${t.artist}`;
  const live = t.source === 'radio';
  $('live').classList.toggle('hidden', !live);
  $('seek-row').classList.toggle('hidden', live);
  markPlaying();
  refreshFavUI();
  if (live) npStart(t); else npStop();
  setSessionMeta(t.title, t.artist, t.artwork);
}

// Kilit ekranı / bildirim kontrolleri
function setSessionMeta(title, artist, artwork) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'Müzik',
      artwork: artwork
        ? [{ src: artwork, sizes: '480x480', type: 'image/jpeg' }]
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
let radioErrors = 0;
audio.addEventListener('error', () => {
  const t = state.queue[state.index];
  if (t && t.source === 'radio') {
    // Yayını açılamayan radyoyu atla, ama art arda en fazla 3 kez
    if (++radioErrors > 3 || state.queue.length < 2) {
      radioErrors = 0;
      $('np-artist').textContent = 'Bu radyo şu an açılamıyor, başka birini dene.';
      return;
    }
  }
  // Çalınamayan şarkıyı atla
  if (state.queue.length > 1) setTimeout(next, 800);
});
audio.addEventListener('playing', () => { radioErrors = 0; });

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

// ---------- Popüler şarkılar ----------
const GENRES = [
  { label: 'Tümü', value: '' },
  { label: 'Hip-Hop / Rap', value: 'Hip-Hop/Rap' },
  { label: 'Pop', value: 'Pop' },
  { label: 'Elektronik', value: 'Electronic' },
  { label: 'R&B', value: 'R&B/Soul' },
  { label: 'Lo-Fi', value: 'Lo-Fi' },
  { label: 'Rock', value: 'Rock' },
  { label: 'Alternatif', value: 'Alternative' },
  { label: 'Dans', value: 'Dance' },
];
let currentGenre = '';
let popularTracks = [];
let popularReq = 0;

async function fetchTrending(genre) {
  const base = await getApiBase();
  const g = genre ? `&genre=${encodeURIComponent(genre)}` : '';
  const r = await fetch(`${base}/tracks/trending?time=week&limit=50${g}&app_name=${APP_NAME}`);
  if (!r.ok) throw new Error('Popüler liste alınamadı');
  const j = await r.json();
  return (j.data || []).filter((t) => t.is_streamable !== false).map(toTrack);
}

function renderGenres() {
  const box = $('genres');
  box.innerHTML = '';
  GENRES.forEach((g) => {
    const b = document.createElement('button');
    b.className = `chip ${g.value === currentGenre ? 'active' : ''}`;
    b.textContent = g.label;
    b.addEventListener('click', () => { currentGenre = g.value; showPopular(); });
    box.appendChild(b);
  });
}

async function showPopular() {
  const req = ++popularReq;
  renderGenres();
  $('popular').classList.remove('hidden');
  $('results-head').classList.add('hidden');
  $('search-input').value = '';
  const status = $('status');
  status.style.display = 'block';
  status.textContent = 'Popüler şarkılar yükleniyor…';
  $('results').innerHTML = '';
  try {
    const list = await fetchTrending(currentGenre);
    if (req !== popularReq) return;
    popularTracks = list;
    if (!list.length) { status.textContent = 'Bu türde şu an şarkı yok.'; return; }
    status.style.display = 'none';
    renderList($('results'), list, { onPlay: (i) => playFrom([...popularTracks], i), ranked: true });
  } catch {
    if (req !== popularReq) return;
    apiBase = null;
    status.textContent = 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.';
  }
}

$('back-popular').addEventListener('click', showPopular);

// ---------- Radyo ----------
// Türk radyolarının listesi Radio Browser'dan (ücretsiz, açık radyo rehberi) gelir.
const RADIO_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];
const RADIO_CATS = [
  { label: 'Popüler', re: null },
  { label: 'Rap', re: /\brap\b|hip.?hop|r&b/ },
  { label: 'Pop', re: /pop|kral|power|fenomen|joy|s[uü]per|metro|virgin|number/ },
  { label: 'Slow', re: /slow|kalp|aşk|ask|romantik|nostalj/ },
  { label: 'Arabesk', re: /arabesk|damar|fantezi/ },
  { label: 'Türkü', re: /t[uü]rk[uü]|halk|folk|baba|turkuvaz|traditional/ },
  { label: 'Dans', re: /dans|dance|club/ },
  { label: 'Rock', re: /rock|alternatif|alternative/ },
];
let radioServer = null;
let radioStations = [];
let radioCat = 0;
let radioLoaded = false;

async function radioFetch(path) {
  const list = radioServer ? [radioServer, ...RADIO_SERVERS] : RADIO_SERVERS;
  for (const base of list) {
    try {
      const r = await fetch(base + path);
      if (r.ok) { radioServer = base; return r; }
    } catch {}
  }
  throw new Error('Radyo listesi alınamadı');
}

function countRadioClick(t) {
  // Radyo rehberinin istediği tıklama bildirimi
  if (t.uuid) radioFetch(`/json/url/${t.uuid}`).catch(() => {});
}

async function loadRadios() {
  const status = $('radio-status');
  status.style.display = 'block';
  status.textContent = 'Radyolar yükleniyor…';
  try {
    const r = await radioFetch('/json/stations/search?countrycode=TR&hidebroken=true&order=clickcount&reverse=true&limit=400');
    const data = await r.json();
    const seen = new Set();
    radioStations = [];
    for (const st of data) {
      const url = st.url_resolved || st.url || '';
      if (!url.startsWith('https://')) continue; // güvenli olmayan yayınlar telefonda çalmaz
      const name = (st.name || '').trim().replace(/\s+/g, ' ');
      const key = name.toLocaleLowerCase('tr');
      if (!name || seen.has(key)) continue;
      seen.add(key);
      radioStations.push({
        id: st.stationuuid,
        uuid: st.stationuuid,
        title: name,
        artist: 'Canlı radyo',
        duration: 0,
        artwork: (st.favicon || '').startsWith('https://') ? st.favicon : '',
        source: 'radio',
        url,
        tags: (st.tags || '').toLocaleLowerCase('tr'),
      });
    }
    radioLoaded = true;
    renderRadios();
  } catch {
    status.textContent = 'Radyolar yüklenemedi. İnternetini kontrol edip Radyo sekmesine tekrar dokun.';
  }
}

function radioVisible() {
  const q = $('radio-filter').value.trim().toLocaleLowerCase('tr');
  const cat = RADIO_CATS[radioCat];
  return radioStations.filter((st) => {
    const hay = `${st.title} ${st.tags}`.toLocaleLowerCase('tr');
    if (cat.re && !cat.re.test(hay)) return false;
    return !q || hay.includes(q);
  });
}

function renderRadioCats() {
  const box = $('radio-cats');
  box.innerHTML = '';
  RADIO_CATS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = `chip ${i === radioCat ? 'active' : ''}`;
    b.textContent = c.label;
    b.addEventListener('click', () => { radioCat = i; renderRadioCats(); renderRadios(); });
    box.appendChild(b);
  });
}

function renderRadios() {
  const list = radioVisible();
  const status = $('radio-status');
  status.style.display = list.length ? 'none' : 'block';
  if (!list.length) status.textContent = 'Bu aramaya uyan radyo yok.';
  renderList($('radios'), list, { onPlay: (i) => playFrom([...list], i) });
}

renderRadioCats();
$('radio-filter').addEventListener('input', renderRadios);
document.querySelector('.tab[data-tab="radio"]').addEventListener('click', () => {
  if (!radioLoaded) loadRadios();
});

// ---------- Radyoda şu an çalan şarkı ----------
// Radyolar bu bilgiyi farklı yollarla verir; sırayla denenir, çalışan hatırlanır.
const NP = { timer: null, station: null, text: '', strategy: undefined };

function npStart(st) {
  npStop();
  NP.station = st;
  NP.text = '';
  NP.strategy = undefined;
  npTick();
  NP.timer = setInterval(npTick, 20000);
}

function npStop() {
  clearInterval(NP.timer);
  NP.timer = null;
  NP.station = null;
}

function fixText(str) {
  let x = String(str || '').replace(/\s+/g, ' ').trim();
  if (/[ÃÄÅ][\x80-\xBF]/.test(x)) { try { x = decodeURIComponent(escape(x)); } catch {} }
  return x;
}

async function fetchT(url, ms = 6000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r;
  } finally { clearTimeout(id); }
}

function splitSong(str) {
  const x = fixText(str);
  const m = x.match(/^(.+?)\s+[-–]\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: '', title: x };
}

const NP_STRATEGIES = {
  // StreamTheWorld / Triton (Joy Türk, Virgin, Süper FM, Metro FM…)
  async triton(st) {
    const m = st.url.match(/livestream-redirect\/([A-Z0-9_]+?)(?:AAC|_SC)?(?:\.mp3|\.aac)?(?:[?#]|$)/i)
      || st.url.match(/streamtheworld\.com(?::\d+)?\/([A-Z0-9_]+?)(?:AAC|_SC)?(?:\.mp3|\.aac)?(?:[?#]|$)/i);
    if (!m) return null;
    const r = await fetchT(`https://np.tritondigital.com/public/nowplaying?mountName=${m[1]}&numberToFetch=1&eventType=track`);
    const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
    const prop = (n) => {
      const el = [...xml.getElementsByTagName('property')].find((p) => p.getAttribute('name') === n);
      return el ? fixText(el.textContent) : '';
    };
    const title = prop('cue_title');
    return title ? { artist: prop('track_artist_name'), title } : null;
  },
  // Icecast sunucuları
  async icecast(st) {
    if (/\.m3u8/i.test(st.url)) return null;
    const u = new URL(st.url);
    const r = await fetchT(`${u.origin}/status-json.xsl`);
    const j = await r.json();
    let src = j.icestats && j.icestats.source;
    if (!src) return null;
    if (!Array.isArray(src)) src = [src];
    const mine = src.find((x) => x.listenurl && new URL(x.listenurl, u.origin).pathname === u.pathname) || src[0];
    if (mine.artist && mine.title) return { artist: fixText(mine.artist), title: fixText(mine.title) };
    return mine.title ? splitSong(mine.title) : null;
  },
  // Shoutcast sunucuları
  async shoutcast(st) {
    if (/\.m3u8/i.test(st.url)) return null;
    const u = new URL(st.url);
    try {
      const r = await fetchT(`${u.origin}/stats?sid=1&json=1`);
      const j = await r.json();
      if (j.songtitle) return splitSong(j.songtitle);
    } catch {}
    const r = await fetchT(`${u.origin}/currentsong?sid=1`);
    const txt = (await r.text()).trim();
    return txt && !/^</.test(txt) ? splitSong(txt) : null;
  },
};

async function npTick() {
  const st = NP.station;
  if (!st) return;
  const names = NP.strategy === undefined ? Object.keys(NP_STRATEGIES) : NP.strategy ? [NP.strategy] : [];
  if (!names.length) return;
  // Yolların hepsini aynı anda dene, ilk cevap veren kazanır
  const found = await Promise.any(names.map(async (name) => {
    const info = await NP_STRATEGIES[name](st);
    if (!info) throw new Error('yok');
    return { name, info };
  })).catch(() => null);
  if (st !== NP.station) return;
  if (found) { NP.strategy = found.name; npShow(st, found.info); return; }
  if (NP.strategy === undefined && st === NP.station && !NP.text) NP.strategy = null; // bu radyo bilgi vermiyor
}

function npShow(st, { artist, title }) {
  artist = fixText(artist);
  title = fixText(title);
  if (!title || title.toLocaleLowerCase('tr') === st.title.toLocaleLowerCase('tr')) return;
  const text = artist ? `${artist} – ${title}` : title;
  if (text === NP.text) return;
  NP.text = text;
  $('np-title').textContent = `♪ ${title}`;
  $('np-artist').textContent = artist ? `${artist} · ${st.title}` : st.title;
  document.title = `${text} – ${st.title}`;
  setSessionMeta(title, artist ? `${artist} · ${st.title}` : st.title, st.artwork);
}

// HLS yayınlarına gömülü şarkı bilgisi (iPhone Safari bunu okuyabilir)
if (audio.textTracks && audio.textTracks.addEventListener) {
  audio.textTracks.addEventListener('addtrack', (e) => {
    const tr = e.track;
    if (tr.kind !== 'metadata') return;
    tr.mode = 'hidden';
    tr.addEventListener('cuechange', () => {
      const st = NP.station;
      if (!st || !tr.activeCues) return;
      let artist = '', title = '';
      for (const cue of tr.activeCues) {
        const v = cue.value || {};
        const data = typeof v.data === 'string' ? v.data : (v.info || '');
        if (v.key === 'TIT2') title = data;
        else if (v.key === 'TPE1') artist = data;
        else if (!title && /StreamTitle='([^']*)'/.test(data)) title = data.match(/StreamTitle='([^']*)'/)[1];
        else if (!title && v.key === 'TXXX' && / [-–] /.test(data)) title = data;
      }
      if (!title) return;
      const info = artist ? { artist, title } : splitSong(title);
      NP.strategy = NP.strategy || null; // gömülü bilgi geliyor, uzaktan sormaya gerek yok
      npShow(st, info);
    });
  });
}

// ---------- Arama ----------
let lastResults = [];
$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (!q) { showPopular(); return; }
  popularReq++; // bekleyen popüler isteğini geçersiz kıl
  $('search-input').blur();
  $('popular').classList.add('hidden');
  $('results-head').classList.remove('hidden');
  $('results-title').textContent = `"${q}" için sonuçlar`;
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
$('search-input').addEventListener('search', () => {
  if (!$('search-input').value.trim()) showPopular();
});

showPopular();

// ---------- Kalıcı kitaplık (IndexedDB) ----------
// Şarkı dosyaları telefonun içinde, bu sitenin deposunda saklanır.
const DB_NAME = 'muzik-kitaplik';
const STORE = 'tracks';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function dbTx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const dbAll = () => dbTx('readonly', (st) => st.getAll());
const dbPut = (rec) => dbTx('readwrite', (st) => st.put(rec));
const dbDelete = (id) => dbTx('readwrite', (st) => st.delete(id));

// "Sanatçı - Şarkı.mp3" biçimindeki adları ayır
function parseName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: 'Kitaplığım', title: base };
}

function readDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (d) => { URL.revokeObjectURL(url); resolve(isFinite(d) ? d : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    a.src = url;
  });
}

function recToTrack(rec) {
  return {
    id: rec.id, title: rec.title, artist: rec.artist, duration: rec.duration || 0,
    artwork: '', source: 'local', url: URL.createObjectURL(rec.blob),
  };
}

function libVisible() {
  const q = $('lib-filter').value.trim().toLocaleLowerCase('tr');
  if (!q) return state.localTracks;
  return state.localTracks.filter((t) =>
    `${t.title} ${t.artist}`.toLocaleLowerCase('tr').includes(q));
}

function renderLibrary() {
  const n = state.localTracks.length;
  $('lib-tools').classList.toggle('hidden', n === 0);
  $('lib-info').textContent = n
    ? `${n} şarkı · telefonda kayıtlı, internetsiz de çalar.`
    : 'Kitaplığın boş. "+ Şarkı ekle" ile Dosyalar uygulamasındaki şarkıları seç; bir kez eklemen yeter.';
  const list = libVisible();
  renderList($('local'), list, {
    onPlay: (i) => playFrom([...list], i),
    showFav: false,
    onDelete: deleteFromLibrary,
  });
}

async function loadLibrary() {
  try {
    const recs = await dbAll();
    recs.sort((a, b) => b.added - a.added);
    state.localTracks = recs.map(recToTrack);
  } catch (err) {
    console.warn('Kitaplık açılamadı', err);
  }
  renderLibrary();
}

async function deleteFromLibrary(t) {
  if (!confirm(`"${t.title}" kitaplıktan silinsin mi?`)) return;
  await dbDelete(t.id);
  state.localTracks = state.localTracks.filter((x) => x.id !== t.id);
  renderLibrary();
}

$('file-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  // Tarayıcıdan dosyaların silinmemesini iste
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const info = $('lib-info');
  let ok = 0;
  for (const [i, f] of files.entries()) {
    info.textContent = `Ekleniyor… (${i + 1}/${files.length})`;
    const { title, artist } = parseName(f.name);
    const rec = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title, artist,
      duration: await readDuration(f),
      blob: f,
      added: Date.now(),
    };
    try {
      await dbPut(rec);
      state.localTracks.unshift(recToTrack(rec));
      ok++;
    } catch (err) {
      console.warn('Kaydedilemedi', err);
      alert(`"${title}" kaydedilemedi. Telefonda yer kalmamış olabilir.`);
      break;
    }
  }
  renderLibrary();
});

$('lib-filter').addEventListener('input', renderLibrary);
$('lib-playall').addEventListener('click', () => {
  const list = libVisible();
  if (list.length) playFrom([...list], 0);
});

loadLibrary();
renderFavs();

// Uygulama olarak yüklenebilmesi için service worker.
// Yeni sürüm yayınlanınca sayfayı bir kez kendiliğinden yeniler.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    // Şarkı çalıyorsa kesmemek için yenilemeyi atla
    if (!audio.paused) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update();
        // Uygulamaya geri dönüldüğünde de yeni sürüm var mı bak
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
