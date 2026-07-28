// effect-art.js — what an activeEffect looks like.
//
// Effects are sim state: src/sim/spells/core.js owns the list, the round
// teardown empties it, and audit() counts it. Their PICTURES are not, and until
// task 13 each effect carried a `draw(now, ctx)` closure defined right there in
// the spell book — a canvas call issued from inside src/sim, which is the exact
// thing the layering is supposed to forbid.
//
// So an effect now carries a plain `art: { k, ... }` descriptor and this table
// draws it, keyed by `k`. Two properties fall out of that:
//
//   * src/sim can be checked mechanically for canvas access, because there is
//     no longer any legitimate reason for the token `ctx` to appear in it.
//   * the descriptor is the same shape the wire already used for the same
//     effects (`net: { k: 'sing', x, y }`, drawn by drawFxLite in
//     draw-snapshot.js). The two tables are still separate, because the
//     fxLite versions are deliberately cheaper — but they are now the same KIND
//     of thing, which is what phase 4 needs to collapse them.
//
// Descriptors are read every frame and may be mutated by the effect's update
// (the two roaming funnels move their `x`); nothing here writes to one.
import { ctx } from './canvas.js';
import { runeRing } from './artkit.js';
import { H } from '../sim/world.js';
import { pushParticle } from './fx.js';

const rr = (a, b) => a + Math.random() * (b - a);

export const EFFECT_ART = {
  __proto__: null,

  // a jagged lightning polyline (spells/core.js boltVisual)
  bolt(now, a) {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.beginPath();
    ctx.moveTo(a.pts[0].x, a.pts[0].y);
    for (const q of a.pts.slice(1)) ctx.lineTo(q.x, q.y);
    ctx.stroke();
  },

  // the singularity's event horizon (spells/core.js spawnSingularity)
  sing(now, a) {
    ctx.fillStyle = '#0a0510';
    ctx.beginPath(); ctx.arc(a.x, a.y, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a55eea';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 0.02);
    ctx.beginPath(); ctx.arc(a.x, a.y, 36 + 5 * Math.sin(now * 0.011), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // the default translucent disc every makeZone gets unless it says otherwise
  zone(now, a) {
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(now * 0.01);
    ctx.fillStyle = a.c;
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  },

  // a haunt sigil at a dead wizard's wisp (player/ghost.js ghostMark)
  rune(now, a) {
    ctx.globalAlpha = 0.75;
    runeRing(ctx, a.x, a.y, 24, a.c, now, { count: 6, lw: 1.2, alpha: 0.8, spin: 0.003 });
    ctx.globalAlpha = 1;
  },

  // Tornado (spells/book.js) and Firestorm (spells/fusion.js) are two stacked
  // funnels with deliberately different tuning — ring width, sway, phase rate
  // and colour all differ, and the fire one tints per ring. Kept as two entries
  // rather than one parameterised kind so neither drifts into the other.
  tornado(now, a) {
    ctx.strokeStyle = 'rgba(207,232,232,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const yy = H - 80 - i * 90;
      const w = 26 + i * 22;
      ctx.beginPath();
      ctx.ellipse(a.x + Math.sin(now * 0.01 + i) * 8, yy, w, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  firestorm(now, a) {
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const yy = H - 80 - i * 90, w = 24 + i * 20;
      ctx.strokeStyle = `rgba(255, ${100 + i * 26}, 60, 0.6)`;
      ctx.beginPath();
      ctx.ellipse(a.x + Math.sin(now * 0.013 + i) * 9, yy, w, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  // Booby Trap's armed charge, blinking down its fuse (spells/fusion.js)
  fuse(now, a) {
    ctx.fillStyle = Math.sin(now * 0.025) > 0 ? '#d8b26a' : '#ff5e57';
    ctx.beginPath(); ctx.arc(a.x, a.y, 7, 0, Math.PI * 2); ctx.fill();
  },

  // Sticky Bomb, latched onto whatever it hit — the descriptor holds the body,
  // so the blinker tracks it (spells/book.js)
  stuck(now, a) {
    ctx.fillStyle = Math.sin(now * 0.03) > 0 ? '#aef05a' : '#fff';
    ctx.beginPath(); ctx.arc(a.body.position.x, a.body.position.y, 4, 0, Math.PI * 2); ctx.fill();
  },

  // Smite's half-second telegraph before the bolt falls (spells/book.js)
  smite(now, a) {
    ctx.strokeStyle = '#fff89e';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(now * 0.02));
    ctx.beginPath(); ctx.arc(a.x, a.y, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // Blizzard: a pale disc that also snows. The snow is spawned from the DRAW,
  // which is legal here and was not where it used to live — it is ambience
  // nobody simulates, and it kept three rolls per frame on the round stream.
  blizzard(now, a) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#d8f4ff';
    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      pushParticle({ kind: 'square', x: a.x + rr(-220, 220), y: a.y + rr(-200, 100), vx: rr(-1, 1), vy: rr(1, 3), life: 24, maxLife: 24, color: '#fff', r: 2 });
    }
  },
};

// Draw every effect that has a picture. An `art` naming a kind this table does
// not have is a bug in this repo (sim and render ship together), so it throws
// rather than drawing nothing — a cosmetic that silently stops appearing is the
// failure mode this whole task exists to close.
export function drawEffects(effects, now) {
  for (const e of effects) {
    if (!e.art) continue; // plenty of effects are pure timers with no picture
    const fn = EFFECT_ART[e.art.k];
    if (!fn) throw new Error(`no art for effect kind '${e.art.k}'`);
    fn(now, e.art);
  }
}

export const effectArtKinds = () => Object.keys(EFFECT_ART);
