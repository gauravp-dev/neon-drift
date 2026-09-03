const Sound = (function () {
  let ctx = null, master = null, musicGain = null, sfxGain = null, comp = null;
  let noiseBuf = null;
  let started = false, playing = false;
  let step = 0, nextTime = 0, timer = null;
  let mode = 'base', pendingMode = null;
  let delaySend = null, delayNode = null, delayFb = null;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function makeNoise() {
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    master = ctx.createGain();
    master.gain.value = 0.85;
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.55;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    delaySend = ctx.createGain();
    delaySend.gain.value = 1;
    delayNode = ctx.createDelay(1.5);
    delayNode.delayTime.value = 0.28;
    delayFb = ctx.createGain();
    delayFb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    delaySend.connect(delayNode);
    delayNode.connect(delayFb);
    delayFb.connect(delayNode);
    delayNode.connect(wet);
    wet.connect(musicGain);
    sfxGain.connect(comp);
    musicGain.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    noiseBuf = makeNoise();
    started = true;
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function env(node, t, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(t, freq, type, dur, peak, dest, detune, sweepTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t + dur);
    if (detune) o.detune.value = detune;
    env(g, t, Math.min(0.012, dur * 0.25), dur, peak);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.06);
  }

  function noise(t, dur, peak, cutStart, cutEnd, q, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 0.9 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q || 1;
    f.frequency.setValueAtTime(cutStart, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(cutEnd, 40), t + dur);
    const g = ctx.createGain();
    env(g, t, 0.006, dur, peak);
    s.connect(f); f.connect(g); g.connect(dest || sfxGain);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const api = {};

  api.unlock = function () { resume(); };

  api.shoot = function (level) {
    if (!started) return;
    const t = ctx.currentTime;
    const base = 760 + (level || 0) * 40 + Math.random() * 60;
    tone(t, base, 'square', 0.075, 0.14, sfxGain, 0, base * 0.35);
    tone(t, base * 1.5, 'triangle', 0.05, 0.07, sfxGain, 8, base * 0.5);
  };

  api.enemyShoot = function () {
    if (!started) return;
    const t = ctx.currentTime;
    tone(t, 220, 'sawtooth', 0.16, 0.09, sfxGain, 0, 90);
  };

  api.hit = function () {
    if (!started) return;
    const t = ctx.currentTime;
    noise(t, 0.07, 0.16, 5200, 900, 1.2);
    tone(t, 320, 'square', 0.05, 0.06, sfxGain, 0, 160);
  };

  api.explode = function (size) {
    if (!started) return;
    const t = ctx.currentTime;
    const s = size || 1;
    noise(t, 0.32 * s, 0.34, 3600, 120, 1.4);
    tone(t, 180 * (1 / s), 'sine', 0.34 * s, 0.24, sfxGain, 0, 32);
    tone(t + 0.01, 90, 'triangle', 0.22 * s, 0.14, sfxGain, 0, 28);
  };

  api.pickup = function (n) {
    if (!started) return;
    const t = ctx.currentTime;
    const notes = [72, 76, 79, 83, 86, 88, 91];
    const m = notes[Math.min(n || 0, notes.length - 1)];
    tone(t, mtof(m), 'triangle', 0.11, 0.10, sfxGain);
    tone(t + 0.03, mtof(m + 7), 'sine', 0.10, 0.06, sfxGain);
  };

  api.dash = function () {
    if (!started) return;
    const t = ctx.currentTime;
    noise(t, 0.22, 0.16, 900, 6000, 3);
    tone(t, 140, 'sawtooth', 0.2, 0.08, sfxGain, 0, 620);
  };

  api.bomb = function () {
    if (!started) return;
    const t = ctx.currentTime;
    noise(t, 1.1, 0.5, 7000, 60, 1.1);
    tone(t, 300, 'sine', 1.0, 0.34, sfxGain, 0, 24);
    tone(t, 60, 'square', 0.7, 0.2, sfxGain, 0, 18);
  };

  api.spawn = function () {
    if (!started) return;
    const t = ctx.currentTime;
    tone(t, 90, 'sawtooth', 0.28, 0.07, sfxGain, 0, 420);
  };

  api.death = function () {
    if (!started) return;
    const t = ctx.currentTime;
    noise(t, 1.4, 0.5, 6000, 50, 1.0);
    tone(t, 420, 'sawtooth', 1.2, 0.24, sfxGain, 0, 24);
    tone(t + 0.05, 210, 'square', 1.0, 0.16, sfxGain, 0, 18);
  };

  api.power = function () {
    if (!started) return;
    const t = ctx.currentTime;
    [60, 67, 72, 76, 79, 84].forEach(function (m, i) {
      tone(t + i * 0.045, mtof(m), 'square', 0.34, 0.085, sfxGain);
      tone(t + i * 0.045, mtof(m + 12), 'triangle', 0.2, 0.045, sfxGain);
    });
    noise(t, 0.55, 0.15, 500, 9000, 2);
  };

  api.powerDown = function () {
    if (!started) return;
    const t = ctx.currentTime;
    [79, 72, 67, 60].forEach(function (m, i) {
      tone(t + i * 0.055, mtof(m), 'triangle', 0.28, 0.055, sfxGain);
    });
  };

  api.capsule = function () {
    if (!started) return;
    const t = ctx.currentTime;
    tone(t, 1300, 'sine', 0.45, 0.06, sfxGain, 0, 2700);
    tone(t + 0.07, 1950, 'sine', 0.38, 0.04, sfxGain, 0, 3300);
  };

  api.lance = function () {
    if (!started) return;
    const t = ctx.currentTime;
    noise(t, 0.16, 0.10, 2600, 700, 6);
    tone(t, 130, 'sawtooth', 0.15, 0.05, sfxGain, 0, 74);
  };

  api.wave = function () {
    if (!started) return;
    const t = ctx.currentTime;
    [57, 64, 69, 76].forEach(function (m, i) {
      tone(t + i * 0.07, mtof(m), 'triangle', 0.5, 0.10, sfxGain);
    });
  };

  api.gameover = function () {
    if (!started) return;
    const t = ctx.currentTime;
    [69, 65, 62, 57].forEach(function (m, i) {
      tone(t + i * 0.18, mtof(m), 'sawtooth', 0.7, 0.10, sfxGain, 0, mtof(m) * 0.5);
    });
  };

  function mkick(t, peak, f0, f1, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
    env(g, t, 0.004, dur, peak);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.1);
  }

  function mhat(t, peak, dur, cut) {
    noise(t, dur, peak, cut, cut * 0.55, 1, musicGain);
  }

  function msnare(t, peak) {
    noise(t, 0.18, peak, 5200, 900, 1.1, musicGain);
    tone(t, 210, 'triangle', 0.11, peak * 0.5, musicGain, 0, 130);
  }

  function mbass(t, freq, dur, peak, type, cutFrom, cutTo, q) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cutFrom, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(cutTo, 40), t + dur);
    env(g, t, 0.008, dur, peak);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.12);
  }

  function marp(t, freq, dur, peak, type, send) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (Math.random() - 0.5) * 8;
    env(g, t, 0.006, dur, peak);
    o.connect(g); g.connect(musicGain);
    if (send > 0) {
      const sg = ctx.createGain();
      sg.gain.value = send;
      g.connect(sg); sg.connect(delaySend);
    }
    o.start(t); o.stop(t + dur + 0.15);
  }

  function mpad(t, notes, dur, peak, type, detune) {
    for (let i = 0; i < notes.length; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = mtof(notes[i]);
      o.detune.value = (i - (notes.length - 1) / 2) * detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + 0.12);
    }
  }

  const MUSIC = {
    base: {
      bpm: 132, delay: 0.28, fb: 0.34,
      chords: [[45, 52, 57, 60], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]],
      seq: [0, 2, 1, 3, 2, 1, 3, 2],
      step(i, c, t, sd) {
        if (i % 4 === 0) { mkick(t, 0.5, 150, 42, 0.26); mhat(t, 0.09, 0.03, 4200); }
        if (i % 4 === 2) mhat(t, 0.055, 0.045, 9000);
        if (i % 2 === 1) mhat(t, 0.028, 0.022, 11000);
        if (i % 2 === 0) mbass(t, mtof(c[0] - 12), sd * 1.6, 0.22, 'sawtooth', 1500, 220, 7);
        marp(t, mtof(c[this.seq[i % 8]] + 12), sd * 0.9, 0.075, 'square', 0.5);
      }
    },

    overdrive: {
      bpm: 158, delay: 0.11, fb: 0.22,
      chords: [[45, 52, 57, 60], [44, 51, 56, 59], [43, 50, 55, 58], [41, 48, 53, 57]],
      seq: [0, 3, 2, 3, 1, 3, 2, 3, 0, 2, 3, 2, 1, 2, 3, 2],
      step(i, c, t, sd) {
        if (i % 2 === 0) mkick(t, 0.55, 172, 46, 0.2);
        if (i % 8 === 4) msnare(t, 0.18);
        mhat(t, i % 2 ? 0.05 : 0.078, 0.026, 12500);
        mbass(t, mtof(c[0] - 12), sd * 1.05, 0.27, 'sawtooth', 2800, 520, 9);
        marp(t, mtof(c[this.seq[i]] + 12), sd * 0.62, 0.085, 'sawtooth', 0.35);
        if (i % 8 === 0) mpad(t, [c[0] + 12, c[2] + 12, c[3] + 12], sd * 6, 0.05, 'square', 13);
      }
    },

    aegis: {
      bpm: 112, delay: 0.42, fb: 0.46,
      chords: [[45, 52, 57, 64], [48, 55, 60, 67], [41, 48, 53, 60], [43, 50, 55, 62]],
      step(i, c, t, sd) {
        if (i === 0 || i === 8) mkick(t, 0.4, 132, 40, 0.36);
        if (i % 8 === 4) mhat(t, 0.04, 0.09, 6500);
        if (i === 0) mpad(t, [c[0], c[1], c[2], c[3]], sd * 15, 0.08, 'triangle', 9);
        if (i % 4 === 0) mbass(t, mtof(c[0] - 12), sd * 3.4, 0.18, 'sine', 900, 200, 3);
        if (i % 4 === 2) marp(t, mtof(c[(i >> 1) % 4] + 12), sd * 2.4, 0.058, 'triangle', 0.7);
      }
    },

    chrono: {
      bpm: 66, delay: 0.7, fb: 0.5,
      chords: [[45, 52, 56, 59], [44, 51, 55, 58]],
      step(i, c, t, sd) {
        if (i === 0) {
          mkick(t, 0.5, 112, 30, 0.75);
          mpad(t, [c[0] - 12, c[0], c[2]], sd * 15, 0.1, 'sawtooth', 24);
        }
        if (i === 8) {
          mkick(t, 0.3, 92, 28, 0.55);
          mpad(t, [c[0] - 12, c[1]], sd * 11, 0.075, 'sawtooth', 20);
        }
        if (i % 8 === 6) msnare(t, 0.1);
        if (i % 4 === 0) tone(t, mtof(c[1] + 12), 'triangle', sd * 3.2, 0.05, musicGain, 0, mtof(c[1]));
        if (i % 2 === 0) mbass(t, mtof(c[0] - 24), sd * 2.4, 0.25, 'sawtooth', 520, 120, 6);
      }
    },

    siphon: {
      bpm: 138, delay: 0.2, fb: 0.42,
      chords: [[48, 55, 60, 64], [46, 53, 58, 62], [50, 57, 62, 67], [45, 52, 57, 61]],
      seq: [0, 2, 3, 2, 1, 3, 2, 0, 3, 2, 1, 2, 0, 3, 1, 2],
      step(i, c, t, sd) {
        if (i % 4 === 0) mkick(t, 0.45, 146, 44, 0.22);
        if (i % 4 === 2) mhat(t, 0.05, 0.05, 10500);
        mhat(t, 0.022, 0.018, 13500);
        if (i % 4 === 0 || i % 8 === 6) mbass(t, mtof(c[0] - 12), sd * 1.3, 0.2, 'triangle', 1400, 400, 4);
        marp(t, mtof(c[this.seq[i]] + 24), sd * 0.5, 0.06, 'triangle', 0.6);
        if (i % 8 === 0) marp(t, mtof(c[0] + 12), sd * 2, 0.042, 'sine', 0);
      }
    },

    lance: {
      bpm: 128, delay: 0.24, fb: 0.3,
      chords: [[41, 48, 52, 53], [41, 48, 52, 54]],
      gate: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
      step(i, c, t, sd) {
        if (i === 0 || i === 6 || i === 10) mkick(t, 0.6, 192, 36, 0.3);
        if (i === 4 || i === 12) msnare(t, 0.22);
        if (i % 2 === 1) mhat(t, 0.035, 0.02, 8000);
        if (this.gate[i]) mbass(t, mtof(c[0] - 24), sd * 0.8, 0.3, 'square', 950, 260, 10);
        if (i % 8 === 0) mpad(t, [c[0] - 12, c[2] - 12], sd * 7, 0.075, 'sawtooth', 27);
        if (i === 12) marp(t, mtof(c[3] + 12), sd * 1.5, 0.07, 'sawtooth', 0.4);
      }
    },

    swarm: {
      bpm: 144, delay: 0.13, fb: 0.48,
      chords: [[45, 52, 57, 64], [47, 54, 59, 66], [43, 50, 55, 62], [45, 52, 57, 64]],
      seq: [0, 1, 2, 3, 2, 1, 3, 0, 1, 2, 3, 1, 2, 3, 0, 2],
      step(i, c, t, sd) {
        if (i % 4 === 0) mkick(t, 0.42, 152, 44, 0.2);
        mhat(t, i % 4 === 2 ? 0.06 : 0.03, 0.016, 14000);
        if (i % 4 === 0) mbass(t, mtof(c[0] - 12), sd * 1.6, 0.19, 'sawtooth', 1200, 300, 6);
        marp(t, mtof(c[this.seq[i]] + 24), sd * 0.35, 0.055, 'square', 0.55);
        marp(t + sd * 0.5, mtof(c[this.seq[(i + 5) % 16]] + 12), sd * 0.3, 0.034, 'square', 0);
      }
    }
  };

  function applyProfile(prof) {
    if (!delayNode) return;
    const t = ctx.currentTime;
    delayNode.delayTime.setTargetAtTime(prof.delay, t, 0.05);
    delayFb.gain.setTargetAtTime(prof.fb, t, 0.05);
  }

  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.16) {
      if (pendingMode && step % 4 === 0) {
        mode = pendingMode;
        pendingMode = null;
        applyProfile(MUSIC[mode]);
      }
      const prof = MUSIC[mode];
      const sd = 60 / prof.bpm / 4;
      const chord = prof.chords[(step / 16 | 0) % prof.chords.length];
      prof.step(step % 16, chord, nextTime, sd);
      step++;
      nextTime += sd;
    }
  }

  api.setMusicMode = function (name) {
    const m = MUSIC[name] ? name : 'base';
    if (!playing) { mode = m; pendingMode = null; if (ctx) applyProfile(MUSIC[m]); return; }
    if (m === mode) { pendingMode = null; return; }
    pendingMode = m;
  };

  api.startMusic = function () {
    resume();
    if (!ctx || playing) return;
    playing = true;
    step = 0;
    mode = 'base';
    pendingMode = null;
    applyProfile(MUSIC.base);
    nextTime = ctx.currentTime + 0.08;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 1.6);
    timer = setInterval(tick, 25);
  };

  api.stopMusic = function () {
    if (!ctx || !playing) return;
    playing = false;
    mode = 'base';
    pendingMode = null;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    clearInterval(timer);
    timer = null;
  };

  api.duck = function (amount, seconds) {
    if (!ctx || !playing) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.34 * amount, t + 0.05);
    musicGain.gain.linearRampToValueAtTime(0.34, t + seconds);
  };

  api.debug = function () {
    return {
      state: ctx ? ctx.state : 'none',
      playing, mode, pendingMode, step,
      bpm: MUSIC[mode].bpm
    };
  };

  api.meter = function () {
    if (!ctx) return null;
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    master.connect(a);
    return a;
  };

  api.toggleMute = function () {
    if (!ctx) return false;
    const muted = master.gain.value > 0.01;
    master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
    return muted;
  };

  return api;
})();
