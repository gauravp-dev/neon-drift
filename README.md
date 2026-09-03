# NEON DRIFT

A twin-stick neon vector shooter. Pure vanilla JavaScript + WebGL2 — no build step,
no dependencies, no assets. Open `index.html` in a browser and play.

```
open neon-drift/index.html
```

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | thrust |
| mouse | aim |
| hold left mouse / `Space` | fire |
| `Shift` / right-click | phase dash (brief invulnerability) |
| `E` / middle-click | pulse bomb (clears the arena) |
| `P` / `Esc` | pause |
| `M` | mute |
| gamepad | left stick moves, right stick aims and fires, `LT`/`A` dash, `RB`/`B` bomb |

## Rules

- Collect green geoms to raise the score multiplier. The multiplier also upgrades the
  weapon: single shot → twin → triple → quad → five-way spread.
- Dying resets the multiplier to x1, drops your active super power, and clears nearby
  enemies.
- Waves escalate; every third wave grants an extra pulse bomb.

## Super powers

Capsules drift into the arena every 15–24 s, and sentries, splitters and singularities
can drop one when they die. Fly into a capsule to arm its power — only one is active at
a time, and picking up a new one replaces it. The HUD shows the name and a drain bar,
and the whole screen takes on the power's colour while it runs.

| Capsule | | Effect |
| --- | --- | --- |
| **OVERDRIVE** | amber | ~3× fire rate, two extra spread barrels, fat high-velocity rounds. 12 s |
| **AEGIS** | cyan | Three orbiting hex shells. Each eats an enemy or a volley on contact, and a spent shell grows back every 3.2 s. 18 s |
| **CHRONO** | violet | Enemies, their bullets and spawn portals run at 28% speed. You don't. 9 s |
| **SIPHON** | lime | Vacuums every geom in the arena and each one counts double toward the multiplier. 14 s |
| **LANCE** | magenta | Fire becomes a piercing beam to the arena wall — hits everything in the line, deletes enemy fire, and tears the grid along its length. 10 s |
| **SWARM** | teal | Two drones orbit your ship and auto-fire at the nearest target. 15 s |

## Enemies

| | Behaviour |
| --- | --- |
| **Seeker** (red diamond) | homes straight in |
| **Wanderer** (orange square) | drifts and bounces, 2 HP |
| **Weaver** (violet triangle) | fast sine-wave approach |
| **Splitter** (teal hex) | 4 HP, breaks into three fast minis |
| **Sentry** (magenta octagon) | 6 HP, fires aimed volleys |
| **Singularity** (violet ring) | 14 HP gravity well — drags the grid, your ship and your bullets into it |

## Graphics

Everything is drawn as glowing capsules through a single instanced draw call, then
run through a full HDR post chain:

- **Renderer** — WebGL2 instanced line/glow batches into an `RGBA16F` target
  (falls back to `RGBA8`), additive blending, capsule SDF in the fragment shader
  for round caps and a white-hot core scaled by line luminance.
- **Bloom** — soft-knee bright pass, then three progressively downsampled mips,
  each separably blurred with a 5-tap linear-sampled Gaussian and recombined.
- **Composite** — ACES filmic tonemap, radial chromatic aberration that scales with
  speed and screen shake, barrel/CRT warp, a displacement shockwave ring on
  explosions, vignette, scanlines and film grain.
- **Warping grid** — a 33×19 mass-spring lattice. Neighbour springs plus weak
  anchor springs to rest position, fixed border, semi-implicit Euler at a fixed
  120 Hz step, with per-point displacement clamping so stacked blasts can't blow it
  out. Every bullet, thruster, explosion and gravity well pushes it around, and line
  colour and width track local displacement.
- **Feel** — hit-stop, death slow-motion, screen shake, zoom punch, dash
  after-images, spawn portals, particle streaks.
- **Power tinting** — an active super power pushes the composite toward a duotone in
  its own colour, so you can read your state from the palette alone.
- **Audio** — fully procedural Web Audio, no files. A 16-step lookahead sequencer
  drives seven interchangeable music profiles, each with its own tempo, chord
  progression, drum pattern, bass voice, arp figure and delay setting. Arm a super
  power and the track switches to that power's profile on the next beat; it switches
  back when the power drains. SFX are synthesised the same way.

| Track | | |
| --- | --- | --- |
| base | 132 BPM | four-on-the-floor, filtered saw bass, square arp in A minor |
| OVERDRIVE | 158 BPM | eighth-note kick, backbeat snare, driving saw bass, 16th arp, descending progression |
| AEGIS | 112 BPM | half-time, sustained triangle pad chords, sine sub, long-delay arp |
| CHRONO | 66 BPM | halved tempo, detuned saw drones, sub-octave bass, downward pitch bends |
| SIPHON | 138 BPM | bouncy triangle bass, 16th shaker, plucked two-octave arp, bright major |
| LANCE | 128 BPM | gated square sub-bass, heavy snare on 2 and 4, minor-second pad dissonance |
| SWARM | 144 BPM | skittering double-layer square arp, tight hats, busiest pattern |

Runs at 120 fps at 3024×1612 with ~25 enemies and ~2000 line instances.

## Layout

```
index.html      markup, HUD, title / game-over screens
js/gl.js        shader, program and framebuffer helpers
js/render.js    instanced line + glow batches, bloom chain, composite pass
js/grid.js      mass-spring warping grid
js/audio.js     procedural music and SFX
js/game.js      entities, waves, input, game loop
```

`window.ND` exposes live game state (`state`, `player`, `foes`, `caps`, `grid`, `R`)
for tinkering from the console — `ND.spawnCapsule('lance')` drops a capsule on demand.
`Sound.setMusicMode('chrono')` auditions a track without arming its power, and
`Sound.debug()` reports the audio context state, active profile and tempo.
