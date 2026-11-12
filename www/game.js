(() => {
  'use strict';
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), score: $('score'), lives: $('lives'),
    menu: $('menu'), paused: $('paused'), over: $('over'),
    bestMenu: $('bestMenu'), bestOver: $('bestOver'), finalScore: $('finalScore'), newBest: $('newBest'),
    soundBtn: $('soundBtn'),
  };

  // ---- Depolama (gizli modda hata verebilir) ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let best = store.get('gk_best', 0);
  let soundOn = store.get('gk_sound', true);

  // ---- Ekran boyutu ----
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (player) { player.y = H - 110; player.x = Math.min(Math.max(player.x, player.r), W - player.r); }
  }
  window.addEventListener('resize', resize);

  // ---- Ses (WebAudio ile basit efektler) ----
  let actx = null;
  function beep(freq, dur = 0.08, type = 'sine', vol = 0.15, slide = 0) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch {}
  }
  // ---- Yerel (Capacitor) entegrasyonu: Android/iOS uygulamasında çalışırken ----
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const Plugins = (Cap && Cap.Plugins) || {};
  const vibrate = ms => {
    try {
      if (isNative && Plugins.Haptics) {
        const total = Array.isArray(ms) ? ms.reduce((a, b) => a + b, 0) : ms;
        if (total <= 20) Plugins.Haptics.impact({ style: 'LIGHT' });
        else if (total <= 150) Plugins.Haptics.impact({ style: 'HEAVY' });
        else Plugins.Haptics.notification({ type: 'ERROR' });
      } else if (navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  };

  // ---- Oyun durumu ----
  let state = 'menu'; // menu | play | paused | over
  let player, meteors, items, particles, stars, score, lives, time, spawnT, itemT, shieldT, shake, targetX;

  function makeStars() {
    stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.8 + 0.2,
    }));
  }

  function reset() {
    player = { x: W / 2, y: H - 110, r: 20, tilt: 0, inv: 0 };
    targetX = player.x;
    meteors = []; items = []; particles = [];
    score = 0; lives = 3; time = 0; spawnT = 0; itemT = 2; shieldT = 0; shake = 0;
    updateHud();
  }

  const difficulty = () => Math.min(1 + time / 25, 4); // zamanla zorlaşır

  function spawnMeteor() {
    const d = difficulty();
    const r = 14 + Math.random() * 22;
    meteors.push({
      x: r + Math.random() * (W - 2 * r), y: -r, r,
      vy: (140 + Math.random() * 120) * (0.7 + d * 0.35),
      vx: (Math.random() - 0.5) * 40 * d,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3,
      pts: Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.3),
    });
  }

  function spawnItem() {
    const roll = Math.random();
    const type = roll < 0.75 ? 'star' : roll < 0.9 ? 'shield' : 'heart';
    items.push({ type, x: 20 + Math.random() * (W - 40), y: -20, r: 15, vy: 150 + difficulty() * 30, t: 0 });
  }

  function burst(x, y, color, n = 14, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.4, max: 1, color });
    }
  }

  function updateHud() {
    ui.score.textContent = score;
    ui.lives.textContent = '❤'.repeat(Math.max(lives, 0));
  }

  // ---- Girdi: dokunma, fare, klavye ----
  function pointerMove(e) {
    if (state !== 'play') return;
    targetX = e.clientX;
  }
  canvas.addEventListener('pointerdown', pointerMove);
  canvas.addEventListener('pointermove', pointerMove);
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === 'Escape' || e.key === 'p') && (state === 'play' || state === 'paused')) togglePause();
    if ((e.key === ' ' || e.key === 'Enter') && (state === 'menu' || state === 'over')) start();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  // ---- Ekranlar ----
  function show(screen) {
    for (const s of [ui.menu, ui.paused, ui.over]) s.classList.toggle('hidden', s !== screen);
    ui.hud.classList.toggle('hidden', state !== 'play' && state !== 'paused');
  }
  function start() {
    reset(); state = 'play'; show(null); beep(520, 0.12, 'triangle', 0.15, 300);
  }
  function togglePause() {
    if (state === 'play') { state = 'paused'; show(ui.paused); }
    else if (state === 'paused') { state = 'play'; show(null); last = performance.now(); }
  }
  function gameOver() {
    state = 'over';
    const isBest = score > best;
    if (isBest) { best = score; store.set('gk_best', best); }
    ui.finalScore.textContent = score; ui.bestOver.textContent = best; ui.bestMenu.textContent = best;
    ui.newBest.classList.toggle('hidden', !isBest);
    beep(300, 0.5, 'sawtooth', 0.15, -250); vibrate([80, 60, 160]);
    setTimeout(() => { if (state === 'over') show(ui.over); }, 700);
  }
  function toMenu() { state = 'menu'; ui.bestMenu.textContent = best; show(ui.menu); }

  $('startBtn').onclick = start;
  $('againBtn').onclick = start;
  $('resumeBtn').onclick = togglePause;
  $('pauseBtn').onclick = togglePause;
  $('quitBtn').onclick = toMenu;
  $('menuBtn').onclick = toMenu;
  ui.soundBtn.onclick = () => { soundOn = !soundOn; store.set('gk_sound', soundOn); ui.soundBtn.textContent = 'Ses: ' + (soundOn ? 'Açık' : 'Kapalı'); };
  ui.soundBtn.textContent = 'Ses: ' + (soundOn ? 'Açık' : 'Kapalı');
  ui.bestMenu.textContent = best;
  if (isNative) {
    try { Plugins.StatusBar && Plugins.StatusBar.hide(); } catch {}
    try {
      // Android geri tuşu: oyunda duraklat, menüde uygulamadan çık
      Plugins.App && Plugins.App.addListener('backButton', () => {
        if (state === 'play') togglePause();
        else if (state === 'paused' || state === 'over') toMenu();
        else Plugins.App.exitApp();
      });
      Plugins.App && Plugins.App.addListener('pause', () => { if (state === 'play') togglePause(); });
    } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  // ---- Güncelleme ----
  function update(dt) {
    for (const s of stars) { s.y += s.z * 60 * dt * (state === 'play' ? difficulty() : 1); if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    shake = Math.max(0, shake - dt * 30);
    if (state !== 'play') return;

    time += dt;
    // Klavye
    if (keys.ArrowLeft || keys.a) targetX -= 500 * dt;
    if (keys.ArrowRight || keys.d) targetX += 500 * dt;
    targetX = Math.min(Math.max(targetX, player.r), W - player.r);
    const prevX = player.x;
    player.x += (targetX - player.x) * Math.min(1, dt * 14);
    player.tilt = Math.max(-0.5, Math.min(0.5, (player.x - prevX) * 0.05));
    player.inv = Math.max(0, player.inv - dt);
    shieldT = Math.max(0, shieldT - dt);

    // Motor izi
    particles.push({ x: player.x + (Math.random() - 0.5) * 8, y: player.y + 26, vx: (Math.random() - 0.5) * 30,
      vy: 160 + Math.random() * 80, life: 0.35, max: 0.35, color: Math.random() < 0.5 ? '#ffd166' : '#ef8a3a' });

    // Doğurma
    spawnT -= dt;
    if (spawnT <= 0) { spawnMeteor(); spawnT = Math.max(0.18, 0.9 / difficulty()) * (0.6 + Math.random() * 0.8); }
    itemT -= dt;
    if (itemT <= 0) { spawnItem(); itemT = 1.2 + Math.random() * 1.8; }

    // Hayatta kalma puanı
    const surv = Math.floor(time * 2);
    if (surv > (player.surv || 0)) { score += surv - (player.surv || 0); player.surv = surv; updateHud(); }

    // Meteorlar
    for (const m of meteors) {
      m.y += m.vy * dt; m.x += m.vx * dt; m.rot += m.vr * dt;
      if (m.x < m.r || m.x > W - m.r) m.vx *= -1;
      const dx = m.x - player.x, dy = m.y - player.y;
      const hitR = m.r * 0.85 + (shieldT > 0 ? 30 : player.r * 0.8);
      if (!m.dead && dx * dx + dy * dy < hitR * hitR) {
        m.dead = true;
        burst(m.x, m.y, '#a1887f', 18);
        if (shieldT > 0) { score += 5; beep(700, 0.08, 'square', 0.1); updateHud(); }
        else if (player.inv <= 0) {
          lives--; player.inv = 1.5; shake = 12; vibrate(120); beep(140, 0.25, 'sawtooth', 0.2, -60);
          updateHud();
          if (lives <= 0) { burst(player.x, player.y, '#06d6a0', 40, 320); gameOver(); }
        }
      }
    }
    meteors = meteors.filter(m => !m.dead && m.y < H + 60);

    // Eşyalar
    for (const it of items) {
      it.y += it.vy * dt; it.t += dt;
      const dx = it.x - player.x, dy = it.y - player.y, rr = it.r + player.r + 6;
      if (dx * dx + dy * dy < rr * rr) {
        it.dead = true;
        if (it.type === 'star') { score += 10; burst(it.x, it.y, '#ffd166', 10, 160); beep(880, 0.09, 'triangle', 0.12, 400); }
        if (it.type === 'shield') { shieldT = 6; burst(it.x, it.y, '#4cc9f0', 16); beep(440, 0.25, 'sine', 0.15, 440); }
        if (it.type === 'heart') { lives = Math.min(5, lives + 1); burst(it.x, it.y, '#ef476f', 16); beep(660, 0.2, 'sine', 0.15, 220); }
        vibrate(15); updateHud();
      }
    }
    items = items.filter(it => !it.dead && it.y < H + 40);
  }

  // ---- Çizim ----
  function drawShip(x, y, tilt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.fillStyle = '#06d6a0';
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(20, 20); ctx.lineTo(0, 12); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0b1026'; ctx.beginPath(); ctx.arc(0, -2, 6, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#c8fff0'; ctx.beginPath(); ctx.arc(-1.5, -3.5, 2, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  function drawMeteor(m) {
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rot);
    ctx.fillStyle = '#8d6e63'; ctx.beginPath();
    m.pts.forEach((k, i) => { const a = i / m.pts.length * 6.28; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * m.r * k, Math.sin(a) * m.r * k); });
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath(); ctx.arc(m.r * 0.25, -m.r * 0.2, m.r * 0.22, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(-m.r * 0.3, m.r * 0.25, m.r * 0.15, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  function drawStarShape(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawItem(it) {
    const pulse = 1 + Math.sin(it.t * 8) * 0.1;
    if (it.type === 'star') { ctx.fillStyle = '#ffd166'; drawStarShape(it.x, it.y, it.r * pulse, it.t * 2); }
    if (it.type === 'shield') {
      ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(it.x, it.y, it.r * pulse, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(76,201,240,.35)'; ctx.fill();
    }
    if (it.type === 'heart') {
      ctx.fillStyle = '#ef476f'; const s = it.r * pulse / 15;
      ctx.save(); ctx.translate(it.x, it.y); ctx.scale(s, s); ctx.beginPath();
      ctx.moveTo(0, 12); ctx.bezierCurveTo(-18, 0, -12, -16, 0, -6); ctx.bezierCurveTo(12, -16, 18, 0, 0, 12); ctx.fill(); ctx.restore();
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026'); g.addColorStop(1, '#1b1f4a');
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);

    for (const s of stars) { ctx.globalAlpha = s.z; ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2); }
    ctx.globalAlpha = 1;

    if (state !== 'menu') {
      items.forEach(drawItem);
      meteors.forEach(drawMeteor);
      for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;
      if (lives > 0) {
        if (!(player.inv > 0 && Math.floor(player.inv * 10) % 2)) drawShip(player.x, player.y, player.tilt);
        if (shieldT > 0) {
          ctx.globalAlpha = shieldT < 1.5 ? (Math.sin(time * 20) * 0.3 + 0.5) : 0.7;
          ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(player.x, player.y, 32, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    } else {
      drawShip(W / 2, H * 0.82 + Math.sin(performance.now() / 400) * 6, 0);
    }
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (state !== 'paused') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resize(); makeStars(); reset();
  requestAnimationFrame(loop);
})();
