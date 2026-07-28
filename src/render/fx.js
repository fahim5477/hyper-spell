// fx.js — the particle field: spawning it, stepping it, drawing it, and the
// screen shake and full-screen flash that travel with it.
//
// All of this used to live in src/sim/fx.js, where it drew from the sim's
// seeded stream and was monkeypatched by the server bridge so a headless host
// could broadcast it. It is render state now. The sim emits an intention
// (src/sim/emit.js) and applyEmitted below turns each one into pixels — which
// is the same code path the online client already used for the host's fx, so
// couch and online finally run one implementation instead of two.
//
// Math.random on purpose: cosmetic randomness must NOT touch the round stream
// (test/module-boundaries.test.js says as much in the other direction). Two
// browsers watching the same match will scatter their sparks differently and
// that is correct — the particles were never part of the simulation.
import { ctx } from './canvas.js';
import { drawStoryParticles } from './artkit.js';
import { playSfx } from './audio.js';
import { onWorldReset } from '../sim/world.js';
import { MAX_CATCHUP, currentTick } from '../sim/time.js';

export const particles = [];
export let shake = 0;
export let flashColor = '#fff', flashAlpha = 0;

// the draw loop decays both every frame; fx only ever adds to them
export function setShake(v) { shake = v; }
export function setFlashAlpha(v) { flashAlpha = v; }

const rnd = () => Math.random();
const rr = (a, b) => a + Math.random() * (b - a);

export function addShake(v) { shake = Math.min(shake + v, 26); }
export function doFlash(color, alpha = 0.4) { flashColor = color; flashAlpha = Math.max(flashAlpha, alpha); }

export function spawnParticles(x, y, color, count, speed, life = 40) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, v = rnd() * speed;
    particles.push({ kind: 'square', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: life + rnd() * 20, maxLife: life, color, r: 2 + rnd() * 3 });
  }
}

export function spawnRing(x, y, color) {
  particles.push({ kind: 'ring', x, y, r: 12, life: 16, maxLife: 16, color });
}

// flexible bespoke burst — kind/shape/spread/drift/gravity all tunable. Powers
// per-hybrid signature VFX; broadcast to LAN like the other cosmetic emitters.
//   dir: aim (rad, 0 = right)   spread: cone width   up: initial lift
//   g: per-particle gravity (negative = rises, e.g. steam/smoke)
export function spawnBurst(x, y, color, count = 12, o = {}) {
  const kind = o.kind || 'square', speed = o.speed ?? 5, spread = o.spread ?? Math.PI * 2;
  const dir = o.dir ?? 0, up = o.up ?? 0, life = o.life ?? 40, g = o.g ?? 0.25, r = o.r ?? 3;
  for (let i = 0; i < count; i++) {
    const a = dir + (rnd() - 0.5) * spread;
    const v = speed * (0.4 + rnd() * 0.9);
    particles.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: life + rnd() * 15, maxLife: life, color, r: r * (0.6 + rnd() * 0.8), g });
  }
}

export function spawnText(x, y, str, color) {
  particles.push({ kind: 'text', str, x, y, vx: 0, vy: -1.2, life: 50, maxLife: 50, color, r: 16 });
}

// a fully-described particle: the sim sites that used to push one directly, and
// the draw-path ambience in this layer. `spec` is the particle itself.
export function pushParticle(spec) { particles.push(spec); }

export function clearFx() {
  particles.length = 0;
  shake = 0;
  flashColor = '#fff';
  flashAlpha = 0;
}

export function updateParticles(ts) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= ts;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    if (pt.kind === 'ring') { pt.r += 7 * ts; continue; }
    if (pt.kind === 'text') { pt.y += pt.vy * ts; continue; }
    pt.x += pt.vx * ts;
    pt.y += pt.vy * ts;
    if (pt.kind === 'confetti') { pt.vy += 0.06 * ts; pt.x += Math.sin(pt.life * 0.25) * 0.8; }
    else if (pt.kind === 'leaf') { pt.vy = Math.min(pt.vy + 0.02 * ts, 1.1); pt.x += Math.sin(pt.life * 0.12) * 0.6; }
    else if (pt.kind === 'bird') { pt.vx *= 1.008; pt.vy += (pt.g ?? -0.02) * ts; } // picks up speed as it flees
    else if (pt.kind === 'glint') { /* twinkles in place */ }
    else pt.vy += (pt.g ?? 0.25) * ts; // per-particle gravity (spawnBurst can set g<0 to rise)
  }
}

// Particle `life` is counted in TICKS, and it used to be decremented inside
// stepSim so it stayed on the sim's clock through a hitstop (the tick loop
// consumes ticks slower, so the sparks slow with everything else). Stepping
// moved out of the sim with the array, so it follows the tick counter instead
// of being pushed by it: one step per sim tick that has elapsed since the last
// frame, which is the same number stepSim used to take. MAX_CATCHUP bounds a
// backgrounded tab the same way the sim's own accumulator does.
let steppedTo = currentTick();
export function stepFx() {
  const n = Math.min(currentTick() - steppedTo, MAX_CATCHUP);
  steppedTo = currentTick();
  for (let i = 0; i < n; i++) updateParticles(1);
}

export function drawParticles() {
  drawStoryParticles(ctx, particles); // storybook embers/motes/sigil rings (render/artkit.js)
}

// ---- the drain ----
// Every name the sim can emit has an entry here, and an unknown one throws
// rather than being skipped. This channel is closed — sim and render ship in
// the same bundle — so an emitted name with no handler is a bug in this repo,
// not hostile input, and swallowing it is how a cosmetic goes missing in
// silence. (The OPEN channel, where a remote server's names arrive, is
// src/net/client.js's FX_ALLOWED; that one drops unknowns on purpose.)
//
// The four no-ops are the dual-path cosmetics: slowMo, setBanner, addKillFeed
// and boltVisual each also write sim state, so the sim calls them for real AND
// emits them for the wire. Applying them again here would double them.
const HANDLERS = {
  __proto__: null,
  spawnParticles,
  spawnRing,
  spawnBurst,
  spawnText,
  doFlash,
  addShake,
  particle: pushParticle,
  clearFx,
  slowMo: () => {},
  setBanner: () => {},
  addKillFeed: () => {},
  boltVisual: () => {},
};

export function applyEmitted(events) {
  for (const e of events) {
    if (e.f === 'sfx') { playSfx(e.a[0]); continue; }
    const fn = HANDLERS[e.f];
    if (!fn) throw new Error(`no renderer for emitted cosmetic '${e.f}'`);
    fn(...e.a);
  }
}

// exported for the boundary test: the set of names this layer can apply
export const emittedNames = () => [...Object.keys(HANDLERS), 'sfx'];

onWorldReset(() => { clearFx(); steppedTo = currentTick(); });
