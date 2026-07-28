// fx.js — the cosmetic side effects the simulation emits: particles, screen
// shake, flashes, floating text.
//
// Nothing here draws or stores anything any more. Each function queues an event
// on src/sim/emit.js and returns; the particle array, the shake and the flash
// all live in src/render/fx.js, which drains the queue. That is the whole point
// of task 13: the sim states an intention ("a puff of orange here"), and
// whoever is looking decides what that costs.
//
// Two consequences worth naming:
//
//   * the spawners no longer draw from the sim's seeded stream. They used to —
//     four rolls per particle, three per projectile trail per tick — which made
//     the round's random sequence a function of how much ambience happened to
//     be on screen. A headless server and a browser stayed in step only because
//     both ran the same spawner; the draw-path spawners in src/render never
//     did, so a browser's stream already drifted with its frame rate. It does
//     not any more.
//   * they are plain functions, not rebindable bindings. src/net/server-bridge.js
//     used to reassign all ten through their owning module's setter so a
//     headless host could broadcast them; it drains the queue instead, so there
//     is nothing left to monkeypatch and nothing left to unpatch.
import { emit } from './emit.js';

// The ten names on the wire allowlist (src/net/client.js) are exactly the
// cosmetic surface. Six of them are here; slowMo is in pace.js, setBanner in
// match.js, addKillFeed in awards.js and boltVisual in spells/core.js, because
// each of those four also writes sim state and so keeps a direct call too.
export const spawnParticles = (...a) => emit('spawnParticles', ...a);
export const spawnRing = (...a) => emit('spawnRing', ...a);
export const spawnBurst = (...a) => emit('spawnBurst', ...a);
export const spawnText = (...a) => emit('spawnText', ...a);
export const doFlash = (...a) => emit('doFlash', ...a);
export const addShake = (...a) => emit('addShake', ...a);

// A bespoke particle, described rather than constructed: the handful of sim
// sites that used to `particles.push({...})` directly. Deliberately NOT on the
// wire allowlist — those pushes were never broadcast either, and GAME_VERSION 9
// says the wire does not move this phase.
export const emitParticle = (spec) => emit('particle', spec);

// Round teardown. src/sim/match.js's loadMap used to truncate the particle
// array itself; it says so instead, and the renderer drops its own.
export const clearFx = () => emit('clearFx');
