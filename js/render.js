const Renderer = (function () {
  const LINE_STRIDE = 9;
  const GLOW_STRIDE = 7;

  const VS_LINE = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aA;
layout(location=2) in vec2 aB;
layout(location=3) in float aWidth;
layout(location=4) in vec4 aColor;
uniform vec2 uRes;
uniform float uScale;
uniform vec2 uOffset;
out vec2 vLocal;
out float vHalfLen;
out float vRadius;
out vec4 vColor;
void main(){
  vec2 a = aA * uScale + uOffset;
  vec2 b = aB * uScale + uOffset;
  float rad = max(aWidth * uScale, 0.75);
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 mid = (a + b) * 0.5;
  float halfLen = len * 0.5;
  vec2 pos = mid + dir * (aCorner.x * (halfLen + rad)) + nrm * (aCorner.y * rad);
  vLocal = vec2(aCorner.x * (halfLen + rad), aCorner.y * rad);
  vHalfLen = halfLen;
  vRadius = rad;
  vColor = aColor;
  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_LINE = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vHalfLen;
in float vRadius;
in vec4 vColor;
out vec4 frag;
void main(){
  float dx = max(abs(vLocal.x) - vHalfLen, 0.0);
  float d = length(vec2(dx, vLocal.y)) / vRadius;
  float t = clamp(1.0 - d, 0.0, 1.0);
  float halo = t * t;
  float lum = max(vColor.r, max(vColor.g, vColor.b));
  float core = pow(t, 7.0) * pow(min(lum, 1.0), 1.7);
  vec3 c = vColor.rgb * halo + vec3(1.0, 1.0, 1.0) * core * 0.8;
  frag = vec4(c * vColor.a, 1.0);
}`;

  const VS_GLOW = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aCenter;
layout(location=2) in float aRadius;
layout(location=3) in vec4 aColor;
uniform vec2 uRes;
uniform float uScale;
uniform vec2 uOffset;
out vec2 vUv;
out vec4 vColor;
void main(){
  vec2 c = aCenter * uScale + uOffset;
  float r = max(aRadius * uScale, 1.0);
  vec2 pos = c + aCorner * r;
  vUv = aCorner;
  vColor = aColor;
  vec2 clip = (pos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_GLOW = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
out vec4 frag;
void main(){
  float d = length(vUv);
  float t = clamp(1.0 - d, 0.0, 1.0);
  float f = pow(t, 2.6);
  frag = vec4(vColor.rgb * f * vColor.a, 1.0);
}`;

  const VS_FULL = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
out vec2 vUv;
void main(){
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float knee = max(uKnee, 0.0001);
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float w = max(soft, br - uThreshold) / max(br, 0.0001);
  frag = vec4(c * w, 1.0);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 sum = texture(uTex, vUv).rgb * 0.2270270270;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  sum += (texture(uTex, vUv + o1).rgb + texture(uTex, vUv - o1).rgb) * 0.3162162162;
  sum += (texture(uTex, vUv + o2).rgb + texture(uTex, vUv - o2).rgb) * 0.0702702703;
  frag = vec4(sum, 1.0);
}`;

  const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
void main(){ frag = vec4(texture(uTex, vUv).rgb, 1.0); }`;

  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uScene;
uniform sampler2D uB0;
uniform sampler2D uB1;
uniform sampler2D uB2;
uniform vec2 uRes;
uniform float uTime;
uniform float uAberr;
uniform float uBloom;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uWarp;
uniform float uVignette;
uniform float uScan;
uniform float uGrain;
uniform vec3 uTintColor;
uniform float uTint;
uniform float uShockT;
uniform vec2 uShockPos;
uniform float uShockAmp;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = uv + cc * r2 * uWarp;

  if (uShockAmp > 0.001) {
    vec2 sp = uShockPos;
    vec2 dv = (uv - sp) * vec2(aspect, 1.0);
    float dist = length(dv);
    float ring = smoothstep(0.10, 0.0, abs(dist - uShockT));
    uv -= normalize(dv + 1e-6) * ring * uShockAmp / vec2(aspect, 1.0);
  }

  vec2 off = cc * (uAberr * (0.35 + r2 * 1.6));
  vec3 scene;
  scene.r = texture(uScene, uv + off).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - off).b;

  vec3 bloom = texture(uB0, uv + off * 0.4).rgb * 0.50
             + texture(uB1, uv).rgb * 0.80
             + texture(uB2, uv - off * 0.4).rgb * 1.10;

  vec3 col = scene + bloom * uBloom;
  col += uFlashColor * uFlash;
  col = aces(col * 1.06);

  if (uTint > 0.001) {
    float lumv = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, mix(col, lumv * uTintColor, 0.7), uTint);
    col += uTintColor * uTint * 0.03;
  }

  float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159265);
  col *= 1.0 - uScan * sl;
  col *= 1.0 - uVignette * smoothstep(0.10, 0.78, r2);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 331.7) - 0.5) * uGrain;

  float edge = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  frag = vec4(max(col, vec3(0.0)) * edge, 1.0);
}`;

  const R = {
    gl: null, canvas: null, dpr: 1,
    world: { w: 1920, h: 1080 },
    scale: 1, offX: 0, offY: 0,
    post: {
      bloom: 1.15, aberr: 0.0016, warp: 0.055, vignette: 0.55,
      scan: 0.035, grain: 0.045, flash: 0, flashColor: [1, 1, 1],
      tint: 0, tintColor: [1, 1, 1],
      shockT: 0, shockAmp: 0, shockX: 0.5, shockY: 0.5
    }
  };

  let lineData = new Float32Array(LINE_STRIDE * 24000);
  let lineCount = 0;
  let glowData = new Float32Array(GLOW_STRIDE * 4000);
  let glowCount = 0;

  let progLine, progGlow, progBright, progBlur, progCopy, progComp;
  let lineVao, lineBuf, glowVao, glowBuf, fullQuad;
  let scene, mips = [], temps = [];
  let texFmt;

  R.init = function (canvas) {
    R.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return null;
    R.gl = gl;

    const float16 = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    texFmt = float16
      ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };

    progLine = GLX.program(gl, VS_LINE, FS_LINE);
    progGlow = GLX.program(gl, VS_GLOW, FS_GLOW);
    progBright = GLX.program(gl, VS_FULL, FS_BRIGHT);
    progBlur = GLX.program(gl, VS_FULL, FS_BLUR);
    progCopy = GLX.program(gl, VS_FULL, FS_COPY);
    progComp = GLX.program(gl, VS_FULL, FS_COMPOSITE);

    fullQuad = GLX.quadVao(gl);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    const lq = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lq);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    const ls = LINE_STRIDE * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, ls, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, ls, 8); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, ls, 16); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, ls, 20); gl.vertexAttribDivisor(4, 1);

    glowVao = gl.createVertexArray();
    gl.bindVertexArray(glowVao);
    const gq = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gq);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    glowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, glowData.byteLength, gl.DYNAMIC_DRAW);
    const gs = GLOW_STRIDE * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, gs, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, gs, 8); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, gs, 12); gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    scene = GLX.target(gl, 4, 4, texFmt.internal, texFmt.format, texFmt.type, gl.LINEAR);
    for (let i = 0; i < 3; i++) {
      mips.push(GLX.target(gl, 4, 4, texFmt.internal, texFmt.format, texFmt.type, gl.LINEAR));
      temps.push(GLX.target(gl, 4, 4, texFmt.internal, texFmt.format, texFmt.type, gl.LINEAR));
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    R.resize();
    return R;
  };

  R.resize = function () {
    const gl = R.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, Math.floor(R.canvas.clientWidth * dpr));
    const h = Math.max(240, Math.floor(R.canvas.clientHeight * dpr));
    if (R.canvas.width !== w || R.canvas.height !== h) {
      R.canvas.width = w;
      R.canvas.height = h;
    }
    R.dpr = dpr;
    GLX.resize(gl, scene, w, h);
    for (let i = 0; i < 3; i++) {
      const d = 1 << (i + 1);
      const mw = Math.max(2, w / d | 0), mh = Math.max(2, h / d | 0);
      GLX.resize(gl, mips[i], mw, mh);
      GLX.resize(gl, temps[i], mw, mh);
    }
    R.scale = Math.min(w / R.world.w, h / R.world.h);
    R.baseOffX = (w - R.world.w * R.scale) * 0.5;
    R.baseOffY = (h - R.world.h * R.scale) * 0.5;
    R.offX = R.baseOffX;
    R.offY = R.baseOffY;
  };

  R.setCamera = function (shakeX, shakeY, zoom) {
    const w = R.canvas.width, h = R.canvas.height;
    const s = Math.min(w / R.world.w, h / R.world.h) * zoom;
    R.scale = s;
    R.offX = (w - R.world.w * s) * 0.5 + shakeX;
    R.offY = (h - R.world.h * s) * 0.5 + shakeY;
  };

  R.screenToWorld = function (sx, sy) {
    const px = sx * R.dpr, py = sy * R.dpr;
    return { x: (px - R.offX) / R.scale, y: (py - R.offY) / R.scale };
  };

  R.begin = function () { lineCount = 0; glowCount = 0; };

  R.line = function (ax, ay, bx, by, w, r, g, b, a) {
    if (lineCount * LINE_STRIDE + LINE_STRIDE > lineData.length) return;
    const i = lineCount * LINE_STRIDE;
    lineData[i] = ax; lineData[i + 1] = ay;
    lineData[i + 2] = bx; lineData[i + 3] = by;
    lineData[i + 4] = w;
    lineData[i + 5] = r; lineData[i + 6] = g; lineData[i + 7] = b; lineData[i + 8] = a;
    lineCount++;
  };

  R.glow = function (x, y, rad, r, g, b, a) {
    if (glowCount * GLOW_STRIDE + GLOW_STRIDE > glowData.length) return;
    const i = glowCount * GLOW_STRIDE;
    glowData[i] = x; glowData[i + 1] = y; glowData[i + 2] = rad;
    glowData[i + 3] = r; glowData[i + 4] = g; glowData[i + 5] = b; glowData[i + 6] = a;
    glowCount++;
  };

  function drawFull(prog) {
    const gl = R.gl;
    gl.useProgram(prog.handle);
    gl.bindVertexArray(fullQuad.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  R.end = function (time) {
    const gl = R.gl;
    const w = R.canvas.width, h = R.canvas.height;
    const p = R.post;

    GLX.bind(gl, scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (glowCount) {
      gl.useProgram(progGlow.handle);
      gl.uniform2f(progGlow.u.uRes, scene.w, scene.h);
      gl.uniform1f(progGlow.u.uScale, R.scale);
      gl.uniform2f(progGlow.u.uOffset, R.offX, R.offY);
      gl.bindVertexArray(glowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowData, 0, glowCount * GLOW_STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glowCount);
    }

    if (lineCount) {
      gl.useProgram(progLine.handle);
      gl.uniform2f(progLine.u.uRes, scene.w, scene.h);
      gl.uniform1f(progLine.u.uScale, R.scale);
      gl.uniform2f(progLine.u.uOffset, R.offX, R.offY);
      gl.bindVertexArray(lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData, 0, lineCount * LINE_STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lineCount);
    }

    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    GLX.bind(gl, mips[0]);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.useProgram(progBright.handle);
    gl.uniform1i(progBright.u.uTex, 0);
    gl.uniform1f(progBright.u.uThreshold, 0.70);
    gl.uniform1f(progBright.u.uKnee, 0.35);
    drawFull(progBright);

    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        GLX.bind(gl, mips[i]);
        gl.bindTexture(gl.TEXTURE_2D, mips[i - 1].tex);
        gl.useProgram(progCopy.handle);
        gl.uniform1i(progCopy.u.uTex, 0);
        drawFull(progCopy);
      }
      const m = mips[i], t = temps[i];
      gl.useProgram(progBlur.handle);
      gl.uniform1i(progBlur.u.uTex, 0);

      GLX.bind(gl, t);
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.uniform2f(progBlur.u.uDir, 1 / m.w, 0);
      drawFull(progBlur);

      GLX.bind(gl, m);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform2f(progBlur.u.uDir, 0, 1 / m.h);
      drawFull(progBlur);
    }

    GLX.bind(gl, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(progComp.handle);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mips[0].tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mips[1].tex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, mips[2].tex);
    gl.uniform1i(progComp.u.uScene, 0);
    gl.uniform1i(progComp.u.uB0, 1);
    gl.uniform1i(progComp.u.uB1, 2);
    gl.uniform1i(progComp.u.uB2, 3);
    gl.uniform2f(progComp.u.uRes, w, h);
    gl.uniform1f(progComp.u.uTime, time);
    gl.uniform1f(progComp.u.uAberr, p.aberr);
    gl.uniform1f(progComp.u.uBloom, p.bloom);
    gl.uniform1f(progComp.u.uFlash, p.flash);
    gl.uniform3f(progComp.u.uFlashColor, p.flashColor[0], p.flashColor[1], p.flashColor[2]);
    gl.uniform1f(progComp.u.uWarp, p.warp);
    gl.uniform1f(progComp.u.uVignette, p.vignette);
    gl.uniform1f(progComp.u.uScan, p.scan);
    gl.uniform1f(progComp.u.uGrain, p.grain);
    gl.uniform3f(progComp.u.uTintColor, p.tintColor[0], p.tintColor[1], p.tintColor[2]);
    gl.uniform1f(progComp.u.uTint, p.tint);
    gl.uniform1f(progComp.u.uShockT, p.shockT);
    gl.uniform2f(progComp.u.uShockPos, p.shockX, p.shockY);
    gl.uniform1f(progComp.u.uShockAmp, p.shockAmp);
    drawFull(progComp);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  };

  R.stats = function () { return { lines: lineCount, glows: glowCount }; };

  return R;
})();
