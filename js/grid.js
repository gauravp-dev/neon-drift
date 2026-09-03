const WarpGrid = (function () {
  function make(worldW, worldH, spacing) {
    const cols = Math.round(worldW / spacing) + 1;
    const rows = Math.round(worldH / spacing) + 1;
    const n = cols * rows;
    const g = {
      cols, rows, spacing,
      x: new Float32Array(n), y: new Float32Array(n),
      ox: new Float32Array(n), oy: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n),
      fx: new Float32Array(n), fy: new Float32Array(n),
      inv: new Float32Array(n)
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const px = c * spacing, py = r * spacing;
        g.x[i] = g.ox[i] = px;
        g.y[i] = g.oy[i] = py;
        const border = (r === 0 || c === 0 || r === rows - 1 || c === cols - 1);
        g.inv[i] = border ? 0 : 1;
      }
    }
    return g;
  }

  const K_LINK = 1500;
  const C_LINK = 5.5;
  const K_ANCHOR = 88;
  const C_ANCHOR = 3.0;
  const DAMP = 4.0;
  const MAX_DISP = 78;

  function update(g, dt) {
    const { cols, rows, spacing } = g;
    const fx = g.fx, fy = g.fy, x = g.x, y = g.y, vx = g.vx, vy = g.vy;
    fx.fill(0); fy.fill(0);

    for (let r = 0; r < rows; r++) {
      const row = r * cols;
      for (let c = 0; c < cols; c++) {
        const i = row + c;
        if (c < cols - 1) {
          const j = i + 1;
          const dx = x[j] - x[i], dy = y[j] - y[i];
          const len = Math.sqrt(dx * dx + dy * dy) || 1e-5;
          const ext = len - spacing;
          const nx = dx / len, ny = dy / len;
          const rvx = vx[j] - vx[i], rvy = vy[j] - vy[i];
          const f = K_LINK * ext;
          const ffx = nx * f + rvx * C_LINK;
          const ffy = ny * f + rvy * C_LINK;
          fx[i] += ffx; fy[i] += ffy;
          fx[j] -= ffx; fy[j] -= ffy;
        }
        if (r < rows - 1) {
          const j = i + cols;
          const dx = x[j] - x[i], dy = y[j] - y[i];
          const len = Math.sqrt(dx * dx + dy * dy) || 1e-5;
          const ext = len - spacing;
          const nx = dx / len, ny = dy / len;
          const rvx = vx[j] - vx[i], rvy = vy[j] - vy[i];
          const f = K_LINK * ext;
          const ffx = nx * f + rvx * C_LINK;
          const ffy = ny * f + rvy * C_LINK;
          fx[i] += ffx; fy[i] += ffy;
          fx[j] -= ffx; fy[j] -= ffy;
        }
      }
    }

    const damp = Math.exp(-DAMP * dt);
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const im = g.inv[i];
      if (im === 0) { vx[i] = 0; vy[i] = 0; x[i] = g.ox[i]; y[i] = g.oy[i]; continue; }
      const ax = (fx[i] + (g.ox[i] - x[i]) * K_ANCHOR - vx[i] * C_ANCHOR) * im;
      const ay = (fy[i] + (g.oy[i] - y[i]) * K_ANCHOR - vy[i] * C_ANCHOR) * im;
      let nvx = (vx[i] + ax * dt) * damp;
      let nvy = (vy[i] + ay * dt) * damp;
      const sp = nvx * nvx + nvy * nvy;
      if (sp > 4000000) { const s = 2000 / Math.sqrt(sp); nvx *= s; nvy *= s; }
      vx[i] = nvx; vy[i] = nvy;
      let px = x[i] + nvx * dt;
      let py = y[i] + nvy * dt;
      const ddx = px - g.ox[i], ddy = py - g.oy[i];
      const dd2 = ddx * ddx + ddy * ddy;
      if (dd2 > MAX_DISP * MAX_DISP) {
        const k = MAX_DISP / Math.sqrt(dd2);
        px = g.ox[i] + ddx * k;
        py = g.oy[i] + ddy * k;
        vx[i] = nvx * 0.4; vy[i] = nvy * 0.4;
      }
      x[i] = px; y[i] = py;
    }
  }

  function impulse(g, px, py, strength, radius) {
    const { cols, rows, spacing } = g;
    const c0 = Math.max(0, Math.floor((px - radius) / spacing));
    const c1 = Math.min(cols - 1, Math.ceil((px + radius) / spacing));
    const r0 = Math.max(0, Math.floor((py - radius) / spacing));
    const r1 = Math.min(rows - 1, Math.ceil((py + radius) / spacing));
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (g.inv[i] === 0) continue;
        const dx = g.x[i] - px, dy = g.y[i] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const fall = 1 - d / radius;
        const s = strength * fall / (d + 40);
        g.vx[i] += dx * s;
        g.vy[i] += dy * s;
      }
    }
  }

  function attract(g, px, py, strength, radius, swirl) {
    const { cols, rows, spacing } = g;
    const c0 = Math.max(0, Math.floor((px - radius) / spacing));
    const c1 = Math.min(cols - 1, Math.ceil((px + radius) / spacing));
    const r0 = Math.max(0, Math.floor((py - radius) / spacing));
    const r1 = Math.min(rows - 1, Math.ceil((py + radius) / spacing));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (g.inv[i] === 0) continue;
        const dx = px - g.x[i], dy = py - g.y[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
        if (d > radius) continue;
        const f = strength / (d + 120);
        g.vx[i] += (dx / d) * f - (dy / d) * f * swirl;
        g.vy[i] += (dy / d) * f + (dx / d) * f * swirl;
      }
    }
  }

  function draw(g, R, base, hot, alpha) {
    const { cols, rows } = g;
    const x = g.x, y = g.y, ox = g.ox, oy = g.oy;
    const br = base[0], bg = base[1], bb = base[2];
    const hr = hot[0], hg = hot[1], hb = hot[2];
    for (let r = 0; r < rows; r++) {
      const row = r * cols;
      for (let c = 0; c < cols; c++) {
        const i = row + c;
        const dx = x[i] - ox[i], dy = y[i] - oy[i];
        const disp = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 58);
        const t = disp * disp;
        const cr = br + (hr - br) * t;
        const cg = bg + (hg - bg) * t;
        const cb = bb + (hb - bb) * t;
        const w = 1.0 + t * 2.0;
        const a = alpha * (0.36 + t * 1.5);
        if (c < cols - 1) {
          const j = i + 1;
          R.line(x[i], y[i], x[j], y[j], w, cr, cg, cb, a);
        }
        if (r < rows - 1) {
          const j = i + cols;
          R.line(x[i], y[i], x[j], y[j], w, cr, cg, cb, a);
        }
      }
    }
  }

  return { make, update, impulse, attract, draw };
})();
