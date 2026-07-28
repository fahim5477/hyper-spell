// sfx.js — the sound cues the simulation fires.
//
// The synth is browser-only (src/render/audio.js needs window.AudioContext), so
// what lives here is just the cue names and an emitter per name. Firing a cue
// queues `{ f: 'sfx', a: [key] }` on src/sim/emit.js and returns; whoever is
// listening decides whether that becomes a sound (the renderer's drain), a wire
// message (the server bridge) or nothing at all (headless, nobody listening).
//
// The table used to be a bag of no-ops that src/render/audio.js overwrote with
// real voices in the browser and src/net/server-bridge.js re-wrapped to
// broadcast. Two monkeypatches over one object, whose order decided whether a
// LAN client heard anything; now the cue is data and the two listeners are just
// two listeners.
import { emit } from './emit.js';

export const SFX_KEYS = [
  'jump', 'cast', 'explosion', 'lightning', 'death', 'pickup', 'blackhole',
  'freeze', 'fight', 'boing', 'clang', 'squeak', 'oink', 'hyper', 'event',
  'thud', 'boss', 'roundWin', 'victory',
];

export const sfx = {};
for (const key of SFX_KEYS) sfx[key] = () => emit('sfx', key);
