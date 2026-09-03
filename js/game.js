(function () {
  'use strict';

  const W = 1920, H = 1080;
  const FIXED = 1 / 120;
  const TAU = Math.PI * 2;

  const canvas = document.getElementById('gl');
  const fatal = document.getElementById('fatal');
  const R = Renderer.init(canvas);
  if (!R) {
    fatal.style.display = 'flex';
    fatal.textContent = 'WEBGL2 UNAVAILABLE — enable hardware acceleration or try another browser.';
    return;
  }
  R.world.w = W; R.world.h = H;
  R.resize();

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = n => (Math.random() * n) | 0;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  const SHAPES = {
    ship: [[1.25, 0], [-0.72, 0.78], [-0.34, 0], [-0.72, -0.78]],
    diamond: [[1, 0], [0, 0.78], [-1, 0], [0, -0.78]],
    square: [[0.82, 0.82], [-0.82, 0.82], [-0.82, -0.82], [0.82, -0.82]],
    tri: [[1.2, 0], [-0.78, 0.85], [-0.78, -0.85]],
    hex: poly(6), oct: poly(8), ring: poly(14), penta: poly(5)
  };
  function poly(n, phase) {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (phase || 0);
      p.push([Math.cos(a), Math.sin(a)]);
    }
    return p;
  }

  const ENEMY = {
    seeker:      { r: 17, hp: 1, score: 12, col: [1.5, 0.24, 0.46], shape: 'diamond', spd: 215, acc: 620 },
    wanderer:    { r: 19, hp: 2, score: 18, col: [1.55, 0.72, 0.14], shape: 'square', spd: 185, acc: 0 },
    weaver:      { r: 15, hp: 1, score: 22, col: [0.78, 0.36, 1.7], shape: 'tri', spd: 360, acc: 900 },
    splitter:    { r: 27, hp: 4, score: 40, col: [0.10, 1.5, 1.15], shape: 'hex', spd: 145, acc: 380 },
    mini:        { r: 11, hp: 1, score: 10, col: [0.16, 1.6, 1.25], shape: 'hex', spd: 320, acc: 980 },
    sentry:      { r: 23, hp: 6, score: 55, col: [1.7, 0.28, 1.05], shape: 'oct', spd: 55, acc: 200 },
    singularity: { r: 36, hp: 14, score: 150, col: [0.62, 0.34, 1.9], shape: 'ring', spd: 42, acc: 140 }
  };

  const POWERS = {
    overdrive: { name: 'OVERDRIVE', col: [1.9, 1.05, 0.22], tint: [1.5, 0.95, 0.45], amt: 0.20, css: '#ffb03a', dur: 12 },
    aegis:     { name: 'AEGIS',     col: [0.35, 1.6, 2.0],  tint: [0.55, 1.15, 1.8], amt: 0.20, css: '#4ef3ff', dur: 18 },
    chrono:    { name: 'CHRONO',    col: [0.90, 0.45, 2.0], tint: [0.80, 0.55, 1.8], amt: 0.42, css: '#b45cff', dur: 9 },
    siphon:    { name: 'SIPHON',    col: [0.85, 1.9, 0.20], tint: [1.00, 1.50, 0.5], amt: 0.16, css: '#8cff2e', dur: 14 },
    lance:     { name: 'LANCE',     col: [1.9, 0.35, 1.30], tint: [1.50, 0.70, 1.35], amt: 0.22, css: '#ff3ea5', dur: 10 },
    swarm:     { name: 'SWARM',     col: [0.20, 1.7, 1.25], tint: [0.60, 1.45, 1.30], amt: 0.18, css: '#2ee0c0', dur: 15 }
  };
  const POWER_KEYS = Object.keys(POWERS);

  const CAPSULE = (function () {
    const pts = [], seg = 8;
    for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (i / seg) * Math.PI; pts.push([1.45 + Math.cos(a), Math.sin(a)]); }
    for (let i = 0; i <= seg; i++) { const a = Math.PI / 2 + (i / seg) * Math.PI; pts.push([-1.45 + Math.cos(a), Math.sin(a)]); }
    return pts;
  })();

  const GLYPH = {
    overdrive: [[[[-0.62, -0.6], [0.0, 0], [-0.62, 0.6]], false], [[[0.14, -0.6], [0.76, 0], [0.14, 0.6]], false]],
    aegis:     [[poly(6), true]],
    chrono:    [[poly(12), true], [[[0, 0], [0, -0.62]], false], [[[0, 0], [0.42, 0.2]], false]],
    siphon:    [[[[0, -0.85], [0.6, 0], [0, 0.85], [-0.6, 0]], true]],
    lance:     [[[[-0.85, 0], [0.3, 0]], false], [[[0.1, -0.42], [0.85, 0], [0.1, 0.42]], false]],
    swarm:     [[poly(3), true], [poly(3, Math.PI), true]]
  };

  const AMBER = [1.9, 1.5, 0.55];

  const state = {
    mode: 'title',
    score: 0, best: +(store.get('neondrift.best', 0)) || 0,
    mult: 1, multProg: 0, multNeed: 5, peakMult: 1,
    lives: 3, bombs: 3, wave: 0, kills: 0,
    waveQueue: [], waveActive: false, waveTimer: 1.2,
    time: 0, realTime: 0,
    shake: 0, punch: 0, hitStop: 0, timeScale: 1, targetScale: 1,
    respawn: 0, gameOverTimer: 0,
    power: { kind: null, t: 0, dur: 1 }, capTimer: 11
  };

  const player = {
    x: W / 2, y: H / 2, vx: 0, vy: 0, ang: 0, aim: 0,
    r: 17, alive: true, invuln: 0, cool: 0,
    dash: 0, dashCd: 0, dashDX: 1, dashDY: 0,
    thrust: 0, trail: [], shield: 0, shieldRegen: 0, beam: 0
  };

  const bullets = [];
  const foes = [];
  const ebullets = [];
  const parts = [];
  const gems = [];
  const portals = [];
  const rings = [];
  const ghosts = [];
  const caps = [];
  const droneCool = [0, 0];
  let lanceCool = 0, lanceSfx = 0;

  const grid = WarpGrid.make(W, H, 60);

  const stars = [];
  for (let i = 0; i < 170; i++) {
    stars.push({
      x: rand(-200, W + 200), y: rand(-200, H + 200),
      z: rand(0.15, 1), tw: rand(0, TAU), s: rand(0.6, 2.2)
    });
  }

  const keys = Object.create(null);
  const mouse = { x: W / 2, y: H / 2, down: false, right: false };
  let usePad = false;
  let padAim = { x: 1, y: 0, fire: false };

  addEventListener('keydown', e => {
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    Sound.unlock();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (state.mode === 'title') startGame();
      else if (state.mode === 'gameover' && state.gameOverTimer <= 0) startGame();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') Sound.toggleMute();
    if (e.code === 'KeyE') useBomb();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') doDash();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    const p = R.screenToWorld(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    usePad = false;
  });
  addEventListener('mousedown', e => {
    Sound.unlock();
    if (e.button === 0) {
      mouse.down = true;
      if (state.mode === 'title') startGame();
      else if (state.mode === 'gameover' && state.gameOverTimer <= 0) startGame();
    }
    if (e.button === 2) { e.preventDefault(); doDash(); }
    if (e.button === 1) { e.preventDefault(); useBomb(); }
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  addEventListener('resize', () => R.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') togglePause();
  });

  function readPad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }

  let padPrev = { dash: false, bomb: false, start: false };
  function pollPad() {
    const p = readPad();
    if (!p) return { mx: 0, my: 0 };
    const dz = v => Math.abs(v) < 0.22 ? 0 : (v - Math.sign(v) * 0.22) / 0.78;
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0);
    const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    const rl = Math.hypot(rx, ry);
    if (rl > 0.25) { padAim.x = rx / rl; padAim.y = ry / rl; usePad = true; }
    const rt = p.buttons[7] ? p.buttons[7].value : 0;
    padAim.fire = rl > 0.35 || rt > 0.3;
    const dash = !!(p.buttons[6] && p.buttons[6].value > 0.4) || !!(p.buttons[0] && p.buttons[0].pressed);
    const bomb = !!(p.buttons[5] && p.buttons[5].pressed) || !!(p.buttons[1] && p.buttons[1].pressed);
    const start = !!(p.buttons[9] && p.buttons[9].pressed);
    if (dash && !padPrev.dash) doDash();
    if (bomb && !padPrev.bomb) useBomb();
    if (start && !padPrev.start) {
      Sound.unlock();
      if (state.mode === 'title' || (state.mode === 'gameover' && state.gameOverTimer <= 0)) startGame();
      else togglePause();
    }
    padPrev = { dash, bomb, start };
    if (lx || ly) usePad = true;
    return { mx: lx, my: ly };
  }

  function spawnPart(x, y, vx, vy, life, col, w, drag) {
    if (parts.length > 2600) return;
    parts.push({ x, y, vx, vy, life, max: life, col, w: w || 3, drag: drag == null ? 1.4 : drag });
  }

  function burst(x, y, n, speed, col, life, w) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.95);
      spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.55, 1.25), col, w, 1.5);
    }
  }

  function shockRing(x, y, maxR, col, life, w) {
    rings.push({ x, y, r: 6, maxR, life, max: life, col, w: w || 5 });
  }

  function shake(amount) { state.shake = Math.min(46, state.shake + amount); }
  function punch(amount) { state.punch = Math.min(0.09, state.punch + amount); }
  function flash(a, col) {
    R.post.flash = Math.min(1.4, R.post.flash + a);
    if (col) R.post.flashColor = col;
  }
  function screenShock(x, y) {
    R.post.shockX = (x / W); R.post.shockY = (y / H);
    R.post.shockT = 0; R.post.shockAmp = 0.028;
  }

  function explode(x, y, col, size, sound) {
    burst(x, y, Math.round(20 * size), 480 * size, col, 0.75, 3.2);
    burst(x, y, Math.round(8 * size), 190 * size, [1.6, 1.6, 1.6], 0.42, 2.4);
    shockRing(x, y, 90 * size, col, 0.42, 5);
    WarpGrid.impulse(grid, x, y, 30000 * size, 250 * Math.sqrt(size));
    shake(4.5 * size);
    if (sound !== false) Sound.explode(Math.min(1.8, size));
  }

  function startGame() {
    state.mode = 'playing';
    state.score = 0; state.mult = 1; state.multProg = 0; state.multNeed = 5;
    state.peakMult = 1; state.lives = 3; state.bombs = 3; state.wave = 0;
    state.kills = 0; state.waveQueue = []; state.waveActive = false;
    state.waveTimer = 1.0; state.respawn = 0; state.gameOverTimer = 0;
    state.timeScale = 1; state.targetScale = 1; state.hitStop = 0;
    bullets.length = foes.length = ebullets.length = 0;
    parts.length = gems.length = portals.length = rings.length = ghosts.length = 0;
    caps.length = 0;
    state.power.kind = null; state.power.t = 0; state.power.dur = 1;
    state.capTimer = 11;
    lastPowerLabel = '';
    R.post.tint = 0;
    player.x = W / 2; player.y = H / 2; player.vx = player.vy = 0;
    player.alive = true; player.invuln = 2.0; player.cool = 0;
    player.dash = 0; player.dashCd = 0; player.trail.length = 0;
    player.shield = 0; player.shieldRegen = 0; player.beam = 0;
    document.body.dataset.state = 'playing';
    document.getElementById('newBest').classList.remove('show');
    Sound.unlock();
    Sound.startMusic();
    flash(0.5, [0.3, 0.9, 1.2]);
    syncHud(true);
  }

  function togglePause() {
    if (state.mode === 'playing') { state.mode = 'paused'; document.body.dataset.state = 'paused'; }
    else if (state.mode === 'paused') { state.mode = 'playing'; document.body.dataset.state = 'playing'; }
  }

  function gameOver() {
    state.mode = 'gameover';
    state.gameOverTimer = 1.1;
    document.body.dataset.state = 'gameover';
    Sound.stopMusic();
    Sound.gameover();
    const isBest = state.score > state.best;
    if (isBest) {
      state.best = state.score;
      store.set('neondrift.best', String(state.best));
      document.getElementById('newBest').classList.add('show');
    }
    document.getElementById('finalScore').textContent = state.score.toLocaleString();
    document.getElementById('finalWave').textContent = Math.max(1, state.wave);
    document.getElementById('finalKills').textContent = state.kills;
    document.getElementById('finalMult').textContent = 'x' + state.peakMult;
    document.getElementById('titleBest').textContent = state.best.toLocaleString();
  }

  function banner(sub, main) {
    const el = document.getElementById('banner');
    document.getElementById('bannerSub').textContent = sub;
    document.getElementById('bannerMain').textContent = main;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function activatePower(kind) {
    const p = POWERS[kind];
    state.power.kind = kind;
    state.power.t = p.dur;
    state.power.dur = p.dur;
    if (kind === 'aegis') { player.shield = 3; player.shieldRegen = 0; }
    if (kind === 'swarm') { droneCool[0] = 0; droneCool[1] = 0.1; }
    if (kind === 'lance') { lanceCool = 0; lanceSfx = 0; }
    banner('SUPER', p.name);
    Sound.power();
    Sound.setMusicMode(kind);
    Sound.duck(0.5, 0.9);
    flash(0.45, p.tint);
    punch(0.032);
    shake(9);
    shockRing(player.x, player.y, 420, p.col, 0.6, 9);
    shockRing(player.x, player.y, 240, [1.5, 1.5, 1.7], 0.4, 5);
    burst(player.x, player.y, 46, 900, p.col, 0.7, 3.2);
    WarpGrid.impulse(grid, player.x, player.y, 70000, 480);
  }

  function endPower() {
    const kind = state.power.kind;
    if (!kind) return;
    state.power.kind = null;
    state.power.t = 0;
    player.shield = 0;
    player.shieldRegen = 0;
    player.beam = 0;
    Sound.setMusicMode('base');
    Sound.powerDown();
    shockRing(player.x, player.y, 230, POWERS[kind].col, 0.42, 5);
  }

  function spawnCapsule(kind, x, y) {
    const k = kind || POWER_KEYS[randi(POWER_KEYS.length)];
    const at = x != null ? { x, y } : farPoint();
    const a = rand(0, TAU);
    caps.push({
      kind: k, x: at.x, y: at.y,
      vx: Math.cos(a) * rand(45, 95), vy: Math.sin(a) * rand(45, 95),
      rot: rand(0, TAU), age: 0, life: 23, phase: rand(0, TAU)
    });
    Sound.capsule();
    shockRing(at.x, at.y, 190, POWERS[k].col, 0.5, 5);
    WarpGrid.impulse(grid, at.x, at.y, 26000, 300);
  }

  function updateCapsules(dt) {
    state.capTimer -= dt;
    if (state.capTimer <= 0) {
      state.capTimer = rand(15, 24);
      if (caps.length < 2 && state.waveActive) spawnCapsule();
    }
    for (let i = caps.length - 1; i >= 0; i--) {
      const c = caps[i];
      c.age += dt;
      c.life -= dt;
      c.rot += dt * 1.15;
      if (c.life <= 0) {
        burst(c.x, c.y, 12, 260, POWERS[c.kind].col, 0.4, 2.6);
        caps.splice(i, 1);
        continue;
      }
      if (player.alive) {
        const dx = player.x - c.x, dy = player.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 300) {
          const f = 1500 / (d + 90);
          c.vx += (dx / d) * f * dt * 60;
          c.vy += (dy / d) * f * dt * 60;
        }
        if (d < player.r + 34) {
          activatePower(c.kind);
          caps.splice(i, 1);
          continue;
        }
      }
      const drag = Math.exp(-0.85 * dt);
      c.vx *= drag; c.vy *= drag;
      c.x += c.vx * dt; c.y += c.vy * dt;
      const m = 46;
      if (c.x < m) { c.x = m; c.vx = Math.abs(c.vx); }
      if (c.x > W - m) { c.x = W - m; c.vx = -Math.abs(c.vx); }
      if (c.y < m) { c.y = m; c.vy = Math.abs(c.vy); }
      if (c.y > H - m) { c.y = H - m; c.vy = -Math.abs(c.vy); }
      WarpGrid.impulse(grid, c.x, c.y, 1100 * dt * 60, 160);
    }
  }

  function beamLength() {
    const dx = Math.cos(player.aim), dy = Math.sin(player.aim);
    let t = 2600;
    if (dx > 1e-4) t = Math.min(t, (W - player.x) / dx);
    else if (dx < -1e-4) t = Math.min(t, -player.x / dx);
    if (dy > 1e-4) t = Math.min(t, (H - player.y) / dy);
    else if (dy < -1e-4) t = Math.min(t, -player.y / dy);
    return Math.max(60, t);
  }

  function lanceHit() {
    const dx = Math.cos(player.aim), dy = Math.sin(player.aim);
    const len = beamLength();
    for (const f of foes.slice()) {
      if (f.age < f.born) continue;
      const t = (f.x - player.x) * dx + (f.y - player.y) * dy;
      if (t < 0 || t > len) continue;
      const cx = player.x + dx * t, cy = player.y + dy * t;
      if (Math.hypot(f.x - cx, f.y - cy) < f.r + 22) {
        hurtFoe(f, 1, cx, cy);
        spawnPart(cx, cy, rand(-320, 320), rand(-320, 320), 0.24, POWERS.lance.col, 2.8, 2);
      }
    }
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      const t = (b.x - player.x) * dx + (b.y - player.y) * dy;
      if (t < 0 || t > len) continue;
      const cx = player.x + dx * t, cy = player.y + dy * t;
      if (Math.hypot(b.x - cx, b.y - cy) < 26) {
        ebullets.splice(i, 1);
        burst(b.x, b.y, 4, 220, POWERS.lance.col, 0.2, 2.2);
      }
    }
    for (let k = 1; k <= 9; k++) {
      const t = (k / 9) * len;
      WarpGrid.impulse(grid, player.x + dx * t, player.y + dy * t, 3000, 140);
    }
  }

  function dronePos(i) {
    const a = state.time * 2.6 + i * Math.PI;
    return { x: player.x + Math.cos(a) * 68, y: player.y + Math.sin(a) * 68, a };
  }

  function updateDrones(dt) {
    if (state.power.kind !== 'swarm' || !player.alive) return;
    for (let i = 0; i < 2; i++) {
      droneCool[i] -= dt;
      if (droneCool[i] > 0) continue;
      let best = null, bd = 1e9;
      for (const f of foes) {
        if (f.age < f.born) continue;
        const d = Math.hypot(f.x - player.x, f.y - player.y);
        if (d < bd) { bd = d; best = f; }
      }
      if (!best) continue;
      droneCool[i] = 0.2;
      const p = dronePos(i);
      const a = Math.atan2(best.y - p.y, best.x - p.x);
      bullets.push({
        x: p.x, y: p.y, px: p.x, py: p.y,
        vx: Math.cos(a) * 1350, vy: Math.sin(a) * 1350,
        life: 1.3, c: POWERS.swarm.col
      });
      Sound.shoot(0);
    }
  }

  function makeWave(n) {
    const q = [];
    const pool = ['seeker'];
    if (n >= 2) pool.push('wanderer');
    if (n >= 3) pool.push('weaver');
    if (n >= 4) pool.push('splitter');
    if (n >= 6) pool.push('sentry', 'seeker');
    if (n >= 8) pool.push('weaver');
    let t = 0.5;
    const groups = 3 + Math.min(8, Math.floor(n * 0.75));
    for (let i = 0; i < groups; i++) {
      const type = pool[randi(pool.length)];
      let count;
      if (type === 'sentry') count = 1 + (n > 11 ? 1 : 0);
      else if (type === 'splitter') count = 1 + randi(2);
      else count = 2 + randi(3) + Math.floor(n * 0.22);
      q.push({ t, type, count: Math.min(count, 10) });
      t += rand(1.0, 1.9);
    }
    if (n >= 5 && n % 3 === 2) q.push({ t: 1.2, type: 'singularity', count: n > 13 ? 2 : 1 });
    q.sort((a, b) => a.t - b.t);
    return q;
  }

  function farPoint() {
    for (let i = 0; i < 24; i++) {
      const x = rand(120, W - 120), y = rand(120, H - 120);
      if (Math.hypot(x - player.x, y - player.y) > 380) return { x, y };
    }
    return { x: rand(120, W - 120), y: rand(120, H - 120) };
  }

  function queuePortal(type, x, y, delay) {
    portals.push({ x, y, type, t: 0, dur: 0.85 + delay, rot: rand(0, TAU) });
  }

  function spawnFoe(type, x, y) {
    const d = ENEMY[type];
    const f = {
      type, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp + Math.floor(state.wave / 9),
      rot: rand(0, TAU), rotV: rand(-2.2, 2.2), col: d.col, shape: d.shape,
      age: 0, born: 0.28, phase: rand(0, TAU), cool: rand(0.6, 1.8), hurt: 0
    };
    if (type === 'wanderer') {
      const a = rand(0, TAU);
      f.vx = Math.cos(a) * d.spd; f.vy = Math.sin(a) * d.spd;
    }
    foes.push(f);
    WarpGrid.impulse(grid, x, y, 22000, 240);
    return f;
  }

  function updateWaves(dt) {
    if (!state.waveActive) {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        state.wave++;
        state.waveQueue = makeWave(state.wave);
        state.waveActive = true;
        banner('WAVE', String(state.wave));
        Sound.wave();
        flash(0.22, [0.35, 0.85, 1.2]);
      }
      return;
    }
    for (let i = state.waveQueue.length - 1; i >= 0; i--) {
      const g = state.waveQueue[i];
      g.t -= dt;
      if (g.t <= 0) {
        const anchor = farPoint();
        for (let k = 0; k < g.count; k++) {
          const a = (k / g.count) * TAU + rand(0, 1);
          const rad = g.count > 1 ? rand(40, 120) : 0;
          const px = clamp(anchor.x + Math.cos(a) * rad, 90, W - 90);
          const py = clamp(anchor.y + Math.sin(a) * rad, 90, H - 90);
          queuePortal(g.type, px, py, k * 0.07);
        }
        Sound.spawn();
        state.waveQueue.splice(i, 1);
      }
    }
    if (state.waveQueue.length === 0 && foes.length === 0 && portals.length === 0) {
      state.waveActive = false;
      state.waveTimer = 2.6;
      state.bombs = Math.min(4, state.bombs + (state.wave % 3 === 0 ? 1 : 0));
    }
  }

  function updatePortals(dt) {
    for (let i = portals.length - 1; i >= 0; i--) {
      const p = portals[i];
      p.t += dt;
      p.rot += dt * 5;
      const k = p.t / p.dur;
      if (k > 0.45) WarpGrid.impulse(grid, p.x, p.y, 2600 * dt * 60, 190);
      if (p.t >= p.dur) {
        spawnFoe(p.type, p.x, p.y);
        shockRing(p.x, p.y, 120, ENEMY[p.type].col, 0.3, 4);
        portals.splice(i, 1);
      }
    }
  }

  function doDash() {
    if (state.mode !== 'playing' || !player.alive || player.dashCd > 0) return;
    let dx = player.vx, dy = player.vy;
    if (Math.hypot(dx, dy) < 30) { dx = Math.cos(player.aim); dy = Math.sin(player.aim); }
    const l = Math.hypot(dx, dy) || 1;
    player.dashDX = dx / l; player.dashDY = dy / l;
    player.dash = 0.17;
    player.dashCd = 1.05;
    player.invuln = Math.max(player.invuln, 0.34);
    Sound.dash();
    shake(5);
    WarpGrid.impulse(grid, player.x, player.y, 34000, 280);
  }

  function useBomb() {
    if (state.mode !== 'playing' || !player.alive || state.bombs <= 0) return;
    state.bombs--;
    Sound.bomb();
    Sound.duck(0.25, 1.2);
    flash(1.15, [0.8, 0.95, 1.25]);
    shake(30);
    punch(0.075);
    screenShock(player.x, player.y);
    shockRing(player.x, player.y, 1400, [0.6, 1.5, 1.9], 0.85, 14);
    shockRing(player.x, player.y, 900, [1.6, 0.6, 1.9], 0.6, 8);
    WarpGrid.impulse(grid, player.x, player.y, 240000, 1300);
    burst(player.x, player.y, 120, 1500, [0.7, 1.5, 1.9], 0.9, 3.4);
    state.hitStop = 0.09;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      spawnPart(player.x, player.y, Math.cos(a) * 1700, Math.sin(a) * 1700, 0.6, [1.4, 1.4, 1.9], 4, 0.8);
    }
    ebullets.length = 0;
    for (const f of foes.slice()) killFoe(f, false);
    for (let i = 0; i < portals.length; i++) shockRing(portals[i].x, portals[i].y, 100, [1, 1, 1.5], 0.3, 4);
  }

  function addScore(v) {
    state.score += v * state.mult;
  }

  function dropGems(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(60, 260);
      gems.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 9, rot: rand(0, TAU) });
    }
  }

  function killFoe(f, split) {
    const index = foes.indexOf(f);
    if (index < 0) return;
    const d = ENEMY[f.type];
    addScore(d.score);
    state.kills++;
    const size = f.type === 'singularity' ? 2.6 : f.type === 'splitter' ? 1.6 : f.type === 'sentry' ? 1.5 : 1;
    explode(f.x, f.y, f.col, size);
    dropGems(f.x, f.y, f.type === 'singularity' ? 9 : f.type === 'splitter' ? 4 : f.type === 'sentry' ? 3 : 1);
    if (f.type === 'splitter' && split !== false) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(0, 1);
        const m = spawnFoe('mini', f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 30);
        m.vx = Math.cos(a) * 300; m.vy = Math.sin(a) * 300;
        m.born = 0.12;
      }
    }
    const drop = f.type === 'singularity' ? 1 : f.type === 'sentry' ? 0.18 : f.type === 'splitter' ? 0.11 : 0;
    if (drop > 0 && caps.length < 2 && Math.random() < drop) spawnCapsule(null, f.x, f.y);
    if (f.type === 'singularity') {
      flash(0.5, [0.6, 0.5, 1.4]);
      screenShock(f.x, f.y);
      shockRing(f.x, f.y, 900, [0.7, 0.45, 1.9], 0.7, 10);
      punch(0.04);
    }
    foes.splice(index, 1);
  }

  function hurtFoe(f, dmg, hx, hy) {
    f.hp -= dmg;
    f.hurt = 0.12;
    if (f.hp <= 0) { killFoe(f); return true; }
    Sound.hit();
    burst(hx, hy, 5, 260, f.col, 0.28, 2.4);
    return false;
  }

  function playerDie() {
    if (!player.alive) return;
    endPower();
    player.alive = false;
    state.lives--;
    state.mult = 1; state.multProg = 0; state.multNeed = 5;
    state.respawn = 1.9;
    state.targetScale = 0.22;
    state.hitStop = 0.14;
    Sound.death();
    Sound.duck(0.3, 1.6);
    flash(0.85, [1.3, 0.5, 0.7]);
    shake(34);
    punch(0.06);
    screenShock(player.x, player.y);
    explode(player.x, player.y, [1.2, 1.9, 2.0], 2.4, false);
    shockRing(player.x, player.y, 700, [0.6, 1.6, 1.9], 0.75, 10);
    WarpGrid.impulse(grid, player.x, player.y, 170000, 850);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, s = rand(200, 1300);
      spawnPart(player.x, player.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.5), [0.5, 1.6, 1.9], 3.4, 0.9);
    }
    for (const f of foes.slice()) {
      if (Math.hypot(f.x - player.x, f.y - player.y) < 330) killFoe(f);
    }
    if (state.lives <= 0) setTimeout(gameOver, 900);
  }

  function respawn() {
    player.x = W / 2; player.y = H / 2; player.vx = player.vy = 0;
    player.alive = true; player.invuln = 2.4; player.dash = 0; player.dashCd = 0;
    player.trail.length = 0;
    flash(0.35, [0.4, 1.0, 1.3]);
    shockRing(player.x, player.y, 320, [0.5, 1.5, 1.9], 0.5, 6);
    WarpGrid.impulse(grid, player.x, player.y, 90000, 440);
  }

  function weaponLevel() {
    const m = state.mult;
    let lvl = m >= 24 ? 4 : m >= 14 ? 3 : m >= 7 ? 2 : m >= 3 ? 1 : 0;
    if (state.power.kind === 'overdrive') lvl = Math.min(4, lvl + 2);
    return lvl;
  }

  function fire() {
    const lvl = weaponLevel();
    const boost = state.power.kind === 'overdrive';
    const speed = boost ? 1950 : 1680;
    const spread = [0, 0.075, 0.13, 0.17, 0.2][lvl];
    const count = lvl + 1;
    const base = player.aim + rand(-0.014, 0.014);
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread;
      const a = base + off;
      const nx = Math.cos(a), ny = Math.sin(a);
      const px = player.x + nx * 24 - ny * off * 60;
      const py = player.y + ny * 24 + nx * off * 60;
      bullets.push({
        x: px, y: py, px, py,
        vx: nx * speed + player.vx * 0.28, vy: ny * speed + player.vy * 0.28,
        life: 1.5, big: boost
      });
    }
    player.vx -= Math.cos(player.aim) * 26;
    player.vy -= Math.sin(player.aim) * 26;
    Sound.shoot(lvl);
    WarpGrid.impulse(grid, player.x, player.y, 4200, 130);
  }

  function updatePlayer(dt, mv) {
    if (!player.alive) {
      state.respawn -= dt;
      if (state.respawn <= 0 && state.lives > 0) respawn();
      return;
    }
    player.invuln = Math.max(0, player.invuln - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    if (state.power.kind === 'aegis' && player.shield < 3) {
      player.shieldRegen += dt;
      if (player.shieldRegen >= 3.2) {
        player.shieldRegen = 0;
        player.shield++;
        Sound.pickup(2);
        shockRing(player.x, player.y, 150, POWERS.aegis.col, 0.32, 4);
      }
    }
    player.cool = Math.max(0, player.cool - dt);

    let ax = 0, ay = 0;
    if (keys.KeyW || keys.ArrowUp) ay -= 1;
    if (keys.KeyS || keys.ArrowDown) ay += 1;
    if (keys.KeyA || keys.ArrowLeft) ax -= 1;
    if (keys.KeyD || keys.ArrowRight) ax += 1;
    ax += mv.mx; ay += mv.my;
    const ml = Math.hypot(ax, ay);
    if (ml > 1) { ax /= ml; ay /= ml; }
    player.thrust = Math.min(1, Math.hypot(ax, ay));

    if (player.dash > 0) {
      player.dash -= dt;
      player.vx = player.dashDX * 2050;
      player.vy = player.dashDY * 2050;
      if (Math.random() < 0.9) {
        ghosts.push({ x: player.x, y: player.y, a: player.ang, life: 0.26, max: 0.26 });
      }
      WarpGrid.impulse(grid, player.x, player.y, 5200 * dt * 60, 210);
    } else {
      const accel = 2700;
      player.vx += ax * accel * dt;
      player.vy += ay * accel * dt;
      const drag = Math.exp(-4.4 * dt);
      player.vx *= drag; player.vy *= drag;
      const sp = Math.hypot(player.vx, player.vy);
      const maxSp = 620;
      if (sp > maxSp) { player.vx *= maxSp / sp; player.vy *= maxSp / sp; }
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const pad = 26;
    if (player.x < pad) { player.x = pad; player.vx = Math.abs(player.vx) * 0.35; bumpWall(player.x, player.y); }
    if (player.x > W - pad) { player.x = W - pad; player.vx = -Math.abs(player.vx) * 0.35; bumpWall(player.x, player.y); }
    if (player.y < pad) { player.y = pad; player.vy = Math.abs(player.vy) * 0.35; bumpWall(player.x, player.y); }
    if (player.y > H - pad) { player.y = H - pad; player.vy = -Math.abs(player.vy) * 0.35; bumpWall(player.x, player.y); }

    if (usePad) player.aim = Math.atan2(padAim.y, padAim.x);
    else player.aim = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    const targetAng = Math.hypot(player.vx, player.vy) > 60 && player.dash > 0
      ? Math.atan2(player.vy, player.vx) : player.aim;
    let da = ((targetAng - player.ang + Math.PI * 3) % TAU) - Math.PI;
    player.ang += da * Math.min(1, dt * 26);

    if (Math.hypot(player.vx, player.vy) > 80) {
      const a = player.ang + Math.PI + rand(-0.35, 0.35);
      const s = rand(120, 340) * (0.4 + player.thrust);
      spawnPart(player.x + Math.cos(a) * 18, player.y + Math.sin(a) * 18,
        Math.cos(a) * s + player.vx * 0.25, Math.sin(a) * s + player.vy * 0.25,
        rand(0.16, 0.34), [0.35, 1.2, 1.9], 3.0, 2.6);
    }

    player.trail.push(player.x, player.y);
    if (player.trail.length > 26) player.trail.splice(0, 2);

    const firing = mouse.down || keys.Space || padAim.fire;
    if (state.power.kind === 'lance') {
      player.beam = firing ? 1 : 0;
      if (firing) {
        lanceCool -= dt;
        if (lanceCool <= 0) { lanceCool = 0.095; lanceHit(); }
        lanceSfx -= dt;
        if (lanceSfx <= 0) { lanceSfx = 0.15; Sound.lance(); }
        player.vx -= Math.cos(player.aim) * 380 * dt;
        player.vy -= Math.sin(player.aim) * 380 * dt;
        shake(0.9);
      }
    } else {
      player.beam = 0;
      if (firing && player.cool <= 0) {
        player.cool = state.power.kind === 'overdrive' ? 0.030 : 0.082;
        fire();
      }
    }

    WarpGrid.impulse(grid, player.x, player.y, 420 * dt * 60, 150);
  }

  function bumpWall(x, y) {
    burst(x, y, 4, 220, [0.4, 1.2, 1.9], 0.24, 2.2);
    WarpGrid.impulse(grid, x, y, 13000, 210);
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
        if (b.x < 4 || b.x > W - 4 || b.y < 4 || b.y > H - 4) {
          burst(clamp(b.x, 0, W), clamp(b.y, 0, H), 4, 200, [1.6, 1.3, 0.6], 0.22, 2.2);
          WarpGrid.impulse(grid, clamp(b.x, 0, W), clamp(b.y, 0, H), 11000, 180);
        }
        bullets.splice(i, 1);
        continue;
      }
      if ((i & 1) === 0) WarpGrid.impulse(grid, b.x, b.y, 340 * dt * 60, 90);
    }
  }

  function updateEBullets(dt) {
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
        ebullets.splice(i, 1); continue;
      }
      if (player.alive) {
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (state.power.kind === 'aegis' && player.shield > 0 && d < player.r + 42) {
          ebullets.splice(i, 1);
          burst(b.x, b.y, 5, 250, POWERS.aegis.col, 0.25, 2.4);
          Sound.hit();
          continue;
        }
        if (player.invuln <= 0 && d < player.r + 7) {
          ebullets.splice(i, 1);
          playerDie();
        }
      }
    }
  }

  function updateFoes(dt) {
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      if (!f) continue;
      const d = ENEMY[f.type];
      f.age += dt;
      f.hurt = Math.max(0, f.hurt - dt);
      f.rot += f.rotV * dt;
      if (f.age < f.born) continue;

      const dx = player.x - f.x, dy = player.y - f.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;

      switch (f.type) {
        case 'seeker':
        case 'mini': {
          const sp = d.spd + state.wave * 4;
          f.vx += nx * d.acc * dt; f.vy += ny * d.acc * dt;
          const l = Math.hypot(f.vx, f.vy);
          if (l > sp) { f.vx *= sp / l; f.vy *= sp / l; }
          break;
        }
        case 'wanderer': {
          f.phase += dt * 1.4;
          const a = Math.atan2(f.vy, f.vx) + Math.sin(f.phase * 1.7) * dt * 2.4;
          const sp = d.spd + state.wave * 3;
          f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp;
          break;
        }
        case 'weaver': {
          f.phase += dt * 7.5;
          const sp = d.spd + state.wave * 5;
          const px = -ny, py = nx;
          const w = Math.sin(f.phase) * 0.95;
          f.vx = lerp(f.vx, (nx + px * w) * sp, Math.min(1, dt * 5));
          f.vy = lerp(f.vy, (ny + py * w) * sp, Math.min(1, dt * 5));
          break;
        }
        case 'splitter': {
          f.vx += nx * d.acc * dt; f.vy += ny * d.acc * dt;
          const sp = d.spd + state.wave * 2.5;
          const l = Math.hypot(f.vx, f.vy);
          if (l > sp) { f.vx *= sp / l; f.vy *= sp / l; }
          break;
        }
        case 'sentry': {
          f.vx = lerp(f.vx, nx * d.spd, Math.min(1, dt * 1.2));
          f.vy = lerp(f.vy, ny * d.spd, Math.min(1, dt * 1.2));
          f.cool -= dt;
          if (f.cool <= 0 && player.alive) {
            f.cool = Math.max(0.55, 1.7 - state.wave * 0.045);
            const shots = state.wave > 9 ? 3 : 1;
            for (let k = 0; k < shots; k++) {
              const a = Math.atan2(dy, dx) + (k - (shots - 1) / 2) * 0.22;
              ebullets.push({
                x: f.x + Math.cos(a) * 24, y: f.y + Math.sin(a) * 24,
                px: f.x, py: f.y,
                vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 4
              });
            }
            Sound.enemyShoot();
            burst(f.x, f.y, 5, 200, f.col, 0.22, 2.2);
          }
          break;
        }
        case 'singularity': {
          f.phase += dt;
          f.vx = lerp(f.vx, nx * d.spd, Math.min(1, dt * 0.7));
          f.vy = lerp(f.vy, ny * d.spd, Math.min(1, dt * 0.7));
          WarpGrid.attract(grid, f.x, f.y, 58000 * dt, 520, 0.6);
          if (player.alive) {
            const pull = 62000 / (dist * dist + 4000);
            player.vx += nx * pull * dt * 60;
            player.vy += ny * pull * dt * 60;
          }
          for (let k = bullets.length - 1; k >= 0; k--) {
            const b = bullets[k];
            const bd = Math.hypot(b.x - f.x, b.y - f.y) || 1;
            if (bd < 420) {
              b.vx += ((f.x - b.x) / bd) * 900 * dt;
              b.vy += ((f.y - b.y) / bd) * 900 * dt;
            }
          }
          for (let k = 0; k < foes.length; k++) {
            const o = foes[k];
            if (o === f || o.type === 'singularity') continue;
            const od = Math.hypot(o.x - f.x, o.y - f.y) || 1;
            if (od < 500) {
              o.vx += ((f.x - o.x) / od) * 260 * dt;
              o.vy += ((f.y - o.y) / od) * 260 * dt;
            }
          }
          if (Math.random() < dt * 40) {
            const a = Math.random() * TAU, rr = rand(120, 320);
            spawnPart(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr,
              -Math.cos(a) * 260 - Math.sin(a) * 200, -Math.sin(a) * 260 + Math.cos(a) * 200,
              rand(0.4, 0.9), [0.7, 0.4, 1.9], 2.6, 0.6);
          }
          break;
        }
      }

      f.x += f.vx * dt; f.y += f.vy * dt;

      const m = f.r + 8;
      if (f.x < m) { f.x = m; f.vx = Math.abs(f.vx); }
      if (f.x > W - m) { f.x = W - m; f.vx = -Math.abs(f.vx); }
      if (f.y < m) { f.y = m; f.vy = Math.abs(f.vy); }
      if (f.y > H - m) { f.y = H - m; f.vy = -Math.abs(f.vy); }

      WarpGrid.impulse(grid, f.x, f.y, (f.type === 'singularity' ? 0 : 260) * dt * 60, f.r * 6);

      if (player.alive && dist < f.r + player.r) {
        if (state.power.kind === 'aegis' && player.shield > 0) {
          player.shield--;
          killFoe(f, false);
          Sound.hit();
          shake(9);
          punch(0.02);
          shockRing(player.x, player.y, 230, POWERS.aegis.col, 0.36, 6);
          player.shieldRegen = 0;
          break;
        }
        if (player.invuln <= 0) {
          playerDie();
          break;
        }
      }
    }
  }

  function updateGems(dt) {
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      g.life -= dt;
      g.rot += dt * 3.2;
      if (g.life <= 0) { gems.splice(i, 1); continue; }
      if (player.alive) {
        const siphon = state.power.kind === 'siphon';
        const dx = player.x - g.x, dy = player.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < (siphon ? 4000 : 300)) {
          const pull = (siphon ? 7200 : 2400) / (d * 0.5 + 30);
          g.vx += (dx / d) * pull * dt * 60;
          g.vy += (dy / d) * pull * dt * 60;
        }
        if (d < player.r + 20) {
          gems.splice(i, 1);
          state.multProg += siphon ? 2 : 1;
          Sound.pickup(state.multProg % 7);
          burst(g.x, g.y, 5, 200, [0.9, 1.9, 0.2], 0.26, 2.2);
          if (state.multProg >= state.multNeed) {
            state.multProg = 0;
            state.mult = Math.min(64, state.mult + 1);
            state.multNeed = 4 + state.mult * 2;
            state.peakMult = Math.max(state.peakMult, state.mult);
            flash(0.1, [1.1, 0.85, 0.4]);
            shockRing(player.x, player.y, 160, [1.7, 1.1, 0.4], 0.35, 4);
            const el = document.getElementById('mult');
            el.classList.add('pop');
            setTimeout(() => el.classList.remove('pop'), 100);
          }
          continue;
        }
      }
      const drag = Math.exp(-2.2 * dt);
      g.vx *= drag; g.vy *= drag;
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.x = clamp(g.x, 16, W - 16); g.y = clamp(g.y, 16, H - 16);
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0 || p.x > W) { p.vx *= -0.55; p.x = clamp(p.x, 0, W); }
      if (p.y < 0 || p.y > H) { p.vy *= -0.55; p.y = clamp(p.y, 0, H); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      const k = 1 - r.life / r.max;
      r.r = 6 + r.maxR * (1 - Math.pow(1 - k, 2.4));
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].life -= dt;
      if (ghosts[i].life <= 0) ghosts.splice(i, 1);
    }
  }

  function collide() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        if (!f || f.age < f.born) continue;
        const dx = b.x - f.x, dy = b.y - f.y;
        const rr = f.r + (b.big ? 13 : 9);
        if (dx * dx + dy * dy < rr * rr) {
          bullets.splice(i, 1);
          const died = hurtFoe(f, 1, b.x, b.y);
          if (!died) {
            f.vx += b.vx * 0.045;
            f.vy += b.vy * 0.045;
          }
          WarpGrid.impulse(grid, b.x, b.y, 13000, 200);
          break;
        }
      }
    }
  }

  function step(dt) {
    state.time += dt;
    const mv = { mx: 0, my: 0 };
    if (state.mode === 'playing') {
      const p = pollPad();
      mv.mx = p.mx; mv.my = p.my;
      if (state.power.kind) {
        state.power.t -= dt;
        if (state.power.t <= 0) endPower();
      }
      const fs = state.power.kind === 'chrono' ? 0.28 : 1;
      updateWaves(dt);
      updatePortals(dt * fs);
      updatePlayer(dt, mv);
      updateDrones(dt);
      updateBullets(dt);
      updateEBullets(dt * fs);
      updateFoes(dt * fs);
      collide();
      updateGems(dt);
      updateCapsules(dt);
    }
    updateParts(dt);
    WarpGrid.update(grid, dt);
  }

  const P_COL = [0.32, 1.5, 1.95];

  function drawShape(pts, x, y, rot, s, r, g, b, a, w, closed) {
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const n = pts.length;
    let px = x + (pts[0][0] * ca - pts[0][1] * sa) * s;
    let py = y + (pts[0][0] * sa + pts[0][1] * ca) * s;
    const fx = px, fy = py;
    for (let i = 1; i < n; i++) {
      const qx = x + (pts[i][0] * ca - pts[i][1] * sa) * s;
      const qy = y + (pts[i][0] * sa + pts[i][1] * ca) * s;
      R.line(px, py, qx, qy, w, r, g, b, a);
      px = qx; py = qy;
    }
    if (closed !== false) R.line(px, py, fx, fy, w, r, g, b, a);
  }

  function drawCircle(x, y, rad, seg, r, g, b, a, w, rot) {
    let px = x + Math.cos(rot || 0) * rad, py = y + Math.sin(rot || 0) * rad;
    for (let i = 1; i <= seg; i++) {
      const ang = (rot || 0) + (i / seg) * TAU;
      const qx = x + Math.cos(ang) * rad, qy = y + Math.sin(ang) * rad;
      R.line(px, py, qx, qy, w, r, g, b, a);
      px = qx; py = qy;
    }
  }

  function drawArena() {
    const pulse = 0.7 + 0.3 * Math.sin(state.time * 1.7);
    const c = [0.18 * pulse, 0.75 * pulse, 1.25 * pulse];
    R.line(0, 0, W, 0, 3.2, c[0], c[1], c[2], 1);
    R.line(W, 0, W, H, 3.2, c[0], c[1], c[2], 1);
    R.line(W, H, 0, H, 3.2, c[0], c[1], c[2], 1);
    R.line(0, H, 0, 0, 3.2, c[0], c[1], c[2], 1);
    const L = 130;
    const cc = [1.0, 0.35, 1.4];
    const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [W, H, -1, -1], [0, H, 1, -1]];
    for (const [x, y, sx, sy] of corners) {
      R.line(x, y, x + L * sx, y, 6, cc[0], cc[1], cc[2], 1);
      R.line(x, y, x, y + L * sy, 6, cc[0], cc[1], cc[2], 1);
    }
  }

  function drawStars() {
    const ox = (player.x - W / 2) * 0.02, oy = (player.y - H / 2) * 0.02;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.55 + 0.45 * Math.sin(state.time * 1.3 + s.tw);
      const a = s.z * tw * 0.75;
      R.glow(s.x - ox * s.z * 6, s.y - oy * s.z * 6, s.s * 6, 0.5, 0.7, 1.1, a * 0.5);
    }
  }

  function drawPlayer() {
    if (!player.alive) return;
    const blink = player.invuln > 0 ? (Math.sin(state.time * 42) > -0.35 ? 1 : 0.18) : 1;
    const t = player.trail;
    for (let i = 0; i + 3 < t.length; i += 2) {
      const k = i / Math.max(2, t.length - 2);
      R.line(t[i], t[i + 1], t[i + 2], t[i + 3], 3 + k * 5,
        P_COL[0] * 0.5, P_COL[1] * 0.5, P_COL[2] * 0.6, k * 0.5 * blink);
    }
    for (const g of ghosts) {
      const k = g.life / g.max;
      drawShape(SHAPES.ship, g.x, g.y, g.a, player.r, 0.4, 1.1, 1.7, k * 0.55, 2.6 + k * 2);
    }

    R.glow(player.x, player.y, 78, 0.22, 0.85, 1.3, 0.55 * blink);
    drawShape(SHAPES.ship, player.x, player.y, player.ang, player.r,
      P_COL[0], P_COL[1], P_COL[2], blink, 4.2);

    const inner = 0.55;
    drawShape(SHAPES.ship, player.x, player.y, player.ang, player.r * inner,
      1.4, 1.7, 1.9, blink * 0.85, 2.4);

    if (player.thrust > 0.05 || player.dash > 0) {
      const a = player.ang + Math.PI;
      const len = (16 + player.thrust * 26 + (player.dash > 0 ? 40 : 0)) * (0.8 + 0.2 * Math.sin(state.time * 55));
      const bx = player.x + Math.cos(player.ang) * -12;
      const by = player.y + Math.sin(player.ang) * -12;
      R.line(bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 7,
        1.7, 0.9, 0.35, 0.95 * blink);
      R.line(bx, by, bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6, 4,
        1.9, 1.7, 1.4, blink);
    }

    if (player.dashCd > 0) {
      const k = 1 - player.dashCd / 1.05;
      drawCircle(player.x, player.y, player.r + 14, 26, 0.5, 1.2, 1.8, 0.16 + k * 0.3, 1.6, state.time * 2);
    }
  }

  function drawFoes() {
    for (const f of foes) {
      const spawnK = Math.min(1, f.age / f.born);
      const s = f.r * (0.25 + 0.75 * spawnK);
      const a = spawnK;
      const hurt = f.hurt > 0 ? 1.9 : 1;
      const cr = f.col[0] * hurt, cg = f.col[1] * hurt, cb = f.col[2] * hurt;

      R.glow(f.x, f.y, f.r * 4.2, f.col[0] * 0.4, f.col[1] * 0.4, f.col[2] * 0.4, 0.55 * a);
      drawShape(SHAPES[f.shape], f.x, f.y, f.rot, s, cr, cg, cb, a, 3.6);

      if (f.type === 'splitter' || f.type === 'mini') {
        drawShape(SHAPES.tri, f.x, f.y, -f.rot * 1.6, s * 0.5, cr, cg, cb, a * 0.9, 2.4);
      } else if (f.type === 'sentry') {
        drawCircle(f.x, f.y, s * 0.55, 10, cr, cg, cb, a * 0.9, 2.4, -f.rot);
        const ax = Math.atan2(player.y - f.y, player.x - f.x);
        R.line(f.x, f.y, f.x + Math.cos(ax) * s * 1.5, f.y + Math.sin(ax) * s * 1.5, 3, 1.9, 0.6, 1.4, a * 0.8);
      } else if (f.type === 'wanderer') {
        drawShape(SHAPES.square, f.x, f.y, -f.rot * 1.9, s * 0.55, cr, cg, cb, a * 0.85, 2.2);
      } else if (f.type === 'weaver') {
        R.line(f.x, f.y, f.x - f.vx * 0.045, f.y - f.vy * 0.045, 3.4, cr * 0.7, cg * 0.7, cb, a * 0.7);
      } else if (f.type === 'seeker') {
        drawShape(SHAPES.diamond, f.x, f.y, f.rot, s * 0.45, 1.8, 1.2, 1.3, a * 0.8, 2.2);
      } else if (f.type === 'singularity') {
        const t = state.time;
        drawCircle(f.x, f.y, s * (0.62 + 0.06 * Math.sin(t * 3)), 18, 1.2, 0.7, 2.0, a, 3.0, t * 1.4);
        drawCircle(f.x, f.y, s * 0.34, 12, 1.8, 1.4, 2.0, a, 2.4, -t * 2.6);
        for (let k = 0; k < 5; k++) {
          const ang = t * 1.9 + (k / 5) * TAU;
          const rr = s * (1.5 + 0.35 * Math.sin(t * 2.4 + k));
          const x1 = f.x + Math.cos(ang) * rr, y1 = f.y + Math.sin(ang) * rr;
          const x2 = f.x + Math.cos(ang + 0.5) * rr * 0.72, y2 = f.y + Math.sin(ang + 0.5) * rr * 0.72;
          R.line(x1, y1, x2, y2, 2.6, 0.9, 0.5, 2.0, a * 0.85);
        }
        R.glow(f.x, f.y, s * 2.2, 0.05, 0.02, 0.2, 0.9 * a);
      }

      const hpMax = ENEMY[f.type].hp + Math.floor(state.wave / 9);
      if (hpMax > 2 && f.hp < hpMax) {
        const k = f.hp / hpMax;
        const bw = f.r * 1.7;
        R.line(f.x - bw, f.y - f.r - 16, f.x - bw + 2 * bw * k, f.y - f.r - 16, 2.6, 1.6, 0.35, 0.4, 0.9);
      }
    }
  }

  function drawPortals() {
    for (const p of portals) {
      const k = clamp(p.t / p.dur, 0, 1);
      const col = ENEMY[p.type].col;
      const rad = 20 + (1 - k) * 130;
      const a = 0.35 + k * 0.9;
      drawCircle(p.x, p.y, rad, 20, col[0], col[1], col[2], a, 2.6 + k * 3, p.rot);
      drawCircle(p.x, p.y, rad * 0.55, 12, 1.6, 1.6, 1.8, a * k, 2, -p.rot * 1.6);
      R.glow(p.x, p.y, 60 + k * 90, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, k * 0.8);
      for (let i = 0; i < 4; i++) {
        const ang = p.rot + i * (TAU / 4);
        const r0 = rad * 1.35, r1 = rad * 1.75;
        R.line(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0,
          p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1, 2.6, col[0], col[1], col[2], a * 0.8);
      }
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      const c = b.c || AMBER;
      const w = b.big ? 6.4 : 4.4;
      const tr = b.big ? 0.021 : 0.016;
      R.line(b.x - b.vx * tr, b.y - b.vy * tr, b.x, b.y, w, c[0], c[1], c[2], 1);
      R.glow(b.x, b.y, b.big ? 36 : 26, c[0] * 0.85, c[1] * 0.8, c[2] * 0.7, 0.6);
    }
    for (const b of ebullets) {
      const tx = b.x - b.vx * 0.03, ty = b.y - b.vy * 0.03;
      R.line(tx, ty, b.x, b.y, 4.6, 1.9, 0.28, 0.5, 1);
      R.glow(b.x, b.y, 30, 1.7, 0.25, 0.45, 0.7);
    }
  }

  function drawGems() {
    for (const g of gems) {
      const fade = g.life < 1.6 ? (Math.sin(g.life * 22) > -0.2 ? 1 : 0.25) : 1;
      const pulse = 0.85 + 0.15 * Math.sin(state.time * 6 + g.rot);
      drawShape(SHAPES.diamond, g.x, g.y, g.rot, 9 * pulse, 0.85, 1.9, 0.18, fade, 3);
      R.glow(g.x, g.y, 34, 0.7, 1.6, 0.15, 0.55 * fade);
    }
  }

  function drawParts() {
    for (const p of parts) {
      const k = p.life / p.max;
      const tx = p.x - p.vx * 0.02, ty = p.y - p.vy * 0.02;
      R.line(tx, ty, p.x, p.y, p.w * (0.35 + k * 0.75), p.col[0], p.col[1], p.col[2], k * k);
    }
    for (const r of rings) {
      const k = r.life / r.max;
      const seg = r.r > 400 ? 48 : 26;
      drawCircle(r.x, r.y, r.r, seg, r.col[0], r.col[1], r.col[2], k * k * 0.95, r.w * k + 1);
    }
  }

  function drawGlyph(kind, x, y, rot, s, r, g, b, a, w) {
    const parts = GLYPH[kind];
    for (let i = 0; i < parts.length; i++) {
      drawShape(parts[i][0], x, y, rot, s, r, g, b, a, w, parts[i][1]);
    }
  }

  function drawCapsules() {
    for (const c of caps) {
      const p = POWERS[c.kind];
      const k = Math.min(1, c.age / 0.35);
      const blink = c.life < 4.5 ? (Math.sin(c.life * 17) > -0.3 ? 1 : 0.22) : 1;
      const pulse = 0.92 + 0.08 * Math.sin(state.time * 5.5 + c.phase);
      const s = 15 * k * pulse;
      const a = blink * k;
      R.glow(c.x, c.y, 115 * k, p.col[0] * 0.34, p.col[1] * 0.34, p.col[2] * 0.34, 0.7 * a);
      drawShape(CAPSULE, c.x, c.y, c.rot, s, p.col[0], p.col[1], p.col[2], a, 3.6);
      drawGlyph(c.kind, c.x, c.y, c.rot, s * 0.6, 1.7, 1.75, 1.85, a, 2.6);
      const orb = state.time * 2.2 + c.phase;
      for (let i = 0; i < 3; i++) {
        const a0 = orb + (i / 3) * TAU;
        const rr = s * 2.5;
        R.line(c.x + Math.cos(a0) * rr, c.y + Math.sin(a0) * rr,
          c.x + Math.cos(a0 + 0.44) * rr, c.y + Math.sin(a0 + 0.44) * rr,
          2.6, p.col[0], p.col[1], p.col[2], a * 0.85);
      }
    }
  }

  function drawBeam() {
    if (!player.beam || !player.alive) return;
    const col = POWERS.lance.col;
    const dx = Math.cos(player.aim), dy = Math.sin(player.aim);
    const len = beamLength();
    const ex = player.x + dx * len, ey = player.y + dy * len;
    const flick = 0.86 + 0.14 * Math.sin(state.time * 62);
    R.line(player.x, player.y, ex, ey, 28 * flick, col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0.5);
    R.line(player.x, player.y, ex, ey, 12 * flick, col[0], col[1], col[2], 0.95);
    R.line(player.x, player.y, ex, ey, 4.2, 1.9, 1.7, 1.9, 1);
    R.glow(ex - dx * 26, ey - dy * 26, 110, col[0] * 0.55, col[1] * 0.55, col[2] * 0.55, 0.8);
    R.glow(player.x + dx * 26, player.y + dy * 26, 80, 1.4, 1.0, 1.5, 0.8);
    for (let i = 0; i < 4; i++) {
      const t = rand(0.1, 1) * len;
      const o = rand(-16, 16);
      R.line(player.x + dx * t - dy * o, player.y + dy * t + dx * o,
        player.x + dx * (t + rand(30, 90)) - dy * o * 1.6,
        player.y + dy * (t + rand(30, 90)) + dx * o * 1.6,
        2.4, 1.7, 1.3, 1.9, 0.7);
    }
  }

  function drawDrones() {
    if (state.power.kind !== 'swarm' || !player.alive) return;
    const col = POWERS.swarm.col;
    for (let i = 0; i < 2; i++) {
      const p = dronePos(i);
      R.line(player.x, player.y, p.x, p.y, 1.7, col[0] * 0.35, col[1] * 0.35, col[2] * 0.35, 0.35);
      R.glow(p.x, p.y, 42, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0.7);
      drawShape(SHAPES.tri, p.x, p.y, p.a + Math.PI / 2, 11, col[0], col[1], col[2], 1, 3);
    }
  }

  function drawShield() {
    if (state.power.kind !== 'aegis' || !player.alive || player.shield <= 0) return;
    const col = POWERS.aegis.col;
    R.glow(player.x, player.y, 130, col[0] * 0.22, col[1] * 0.22, col[2] * 0.22, 0.55);
    for (let i = 0; i < player.shield; i++) {
      const rot = state.time * (1.5 + i * 0.6) * (i % 2 ? -1 : 1);
      drawShape(SHAPES.hex, player.x, player.y, rot, player.r + 30 + i * 8,
        col[0], col[1], col[2], 0.9 - i * 0.16, 3.2 - i * 0.6);
    }
  }

  function drawSiphon() {
    if (state.power.kind !== 'siphon' || !player.alive) return;
    const col = POWERS.siphon.col;
    for (const g of gems) {
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (d > 950) continue;
      R.line(player.x, player.y, g.x, g.y, 1.5,
        col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0.3 * (1 - d / 950));
    }
  }

  let lastScore = -1, lastMult = -1, lastWave = -1, lastLives = -1, lastBombs = -1, lastBest = -1, lastPct = -1;
  let lastPowerLabel = '';

  function updatePowerHud() {
    const el = document.getElementById('hudPower');
    const k = state.power.kind;
    const label = k ? (k === 'aegis' ? POWERS[k].name + ' \u00d7' + player.shield : POWERS[k].name) : '';
    if (label !== lastPowerLabel) {
      lastPowerLabel = label;
      if (k) {
        el.style.setProperty('--pc', POWERS[k].css);
        document.getElementById('powerName').textContent = label;
        el.classList.add('on');
      } else {
        el.classList.remove('on');
      }
    }
    if (k) {
      document.getElementById('powerFill').style.width =
        (100 * Math.max(0, state.power.t) / state.power.dur) + '%';
    }
  }
  function pips(el, n, max, cls) {
    let html = '';
    for (let i = 0; i < max; i++) html += '<div class="pip ' + cls + (i < n ? ' on' : '') + '"></div>';
    el.innerHTML = html;
  }
  function syncHud(force) {
    if (force || state.score !== lastScore) {
      document.getElementById('score').textContent = state.score.toLocaleString();
      lastScore = state.score;
    }
    if (force || state.mult !== lastMult) {
      document.getElementById('mult').textContent = 'x' + state.mult;
      lastMult = state.mult;
    }
    const pct = Math.round(100 * state.multProg / state.multNeed);
    if (force || pct !== lastPct) {
      document.getElementById('multfill').style.width = pct + '%';
      lastPct = pct;
    }
    if (force || state.wave !== lastWave) {
      document.getElementById('wave').textContent = Math.max(1, state.wave);
      lastWave = state.wave;
    }
    const shownBest = Math.max(state.best, state.score);
    if (force || shownBest !== lastBest) {
      document.getElementById('best').textContent = shownBest.toLocaleString();
      lastBest = shownBest;
    }
    if (force || state.lives !== lastLives) {
      pips(document.getElementById('lives'), state.lives, 3, '');
      lastLives = state.lives;
    }
    if (force || state.bombs !== lastBombs) {
      pips(document.getElementById('bombs'), state.bombs, 4, 'bomb');
      lastBombs = state.bombs;
    }
    updatePowerHud();
  }

  document.getElementById('titleBest').textContent = state.best.toLocaleString();
  pips(document.getElementById('lives'), 3, 3, '');
  pips(document.getElementById('bombs'), 3, 4, 'bomb');

  let last = performance.now();
  let acc = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.06, (ts - last) / 1000);
    last = ts;
    state.realTime += realDt;

    if (state.gameOverTimer > 0) state.gameOverTimer -= realDt;

    if (state.hitStop > 0) {
      state.hitStop -= realDt;
      state.timeScale = 0.05;
    } else {
      if (!player.alive && state.mode === 'playing') state.targetScale = 0.3;
      else state.targetScale = 1;
      state.timeScale = lerp(state.timeScale, state.targetScale, Math.min(1, realDt * 3.2));
    }
    if (state.mode === 'paused') state.timeScale = 0;

    if (state.mode === 'title' || state.mode === 'gameover') {
      const t = state.realTime;
      if (Math.random() < realDt * 2.4) {
        WarpGrid.impulse(grid, rand(200, W - 200), rand(200, H - 200), rand(45000, 130000), rand(240, 480));
      }
      WarpGrid.attract(grid,
        W / 2 + Math.cos(t * 0.4) * 460, H / 2 + Math.sin(t * 0.31) * 280,
        62000 * realDt, 620, 1.05);
    }

    acc += realDt * state.timeScale;
    let n = 0;
    while (acc >= FIXED && n < 12) { step(FIXED); acc -= FIXED; n++; }
    if (n >= 12) acc = 0;

    state.shake *= Math.exp(-6.5 * realDt);
    state.punch *= Math.exp(-7.5 * realDt);
    R.post.flash *= Math.exp(-7.0 * realDt);
    if (R.post.shockAmp > 0) {
      R.post.shockT += realDt * 1.5;
      R.post.shockAmp *= Math.exp(-4.5 * realDt);
      if (R.post.shockT > 1.4) R.post.shockAmp = 0;
    }

    const sx = (Math.random() - 0.5) * state.shake * R.dpr * 2;
    const sy = (Math.random() - 0.5) * state.shake * R.dpr * 2;
    R.setCamera(sx, sy, 1 + state.punch);

    const pk = state.power.kind;
    if (pk) R.post.tintColor = POWERS[pk].tint;
    R.post.tint = lerp(R.post.tint, pk ? POWERS[pk].amt : 0, Math.min(1, realDt * 5));

    const speed = Math.hypot(player.vx, player.vy);
    R.post.aberr = 0.0012 + state.shake * 0.00022 + speed * 0.0000016 + (player.dash > 0 ? 0.004 : 0)
      + (pk === 'chrono' ? 0.0026 : 0);
    R.post.bloom = 1.12 + state.punch * 3;

    R.begin();
    drawStars();
    const gAlpha = state.mode === 'playing' || state.mode === 'paused' ? 0.72 : 0.58;
    WarpGrid.draw(grid, R, [0.10, 0.25, 0.66], [0.50, 1.15, 2.0], gAlpha);
    drawArena();
    drawParts();
    drawSiphon();
    drawGems();
    drawCapsules();
    drawPortals();
    drawFoes();
    drawBullets();
    drawBeam();
    drawDrones();
    if (state.mode !== 'title') { drawPlayer(); drawShield(); }
    R.end(state.realTime);

    if (state.mode === 'playing' || state.mode === 'paused') syncHud(false);
  }

  window.ND = { state, player, foes, bullets, ebullets, gems, portals, parts, caps, grid, R, POWERS, spawnCapsule };

  requestAnimationFrame(frame);
})();
