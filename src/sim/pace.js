// pace.js — the game's master tempo and its hitstop.
//
// slowMo is the one cosmetic that is also simulation, so the server both calls
// it and broadcasts it. What it scales changed with the fixed timestep: it used
// to shrink the timestep handed to the solver (a 0.05 hitstop meant an 0.8ms
// physStep), which made physics resolution a function of spectacle. Now it
// scales how fast the tick loop CONSUMES real time — the steps themselves are
// always exactly TICK_MS. See src/sim/tick-loop.js.
// THE ONE DELIBERATE EXCEPTION to "simNow() is the sim's only clock".
//
// The deadline below stays on the env clock. Every one of the 14 slowMo call
// sites authors `ms` as a real-world duration — slowMo(0.05, 90) means 90ms as
// the player experiences it — and simNow() is the clock this very hitstop slows
// down. Measuring the deadline there makes the real duration ms/scale and feeds
// back on itself: a 90ms freeze at 0.05 held the sim for 2000ms (22x), and a
// 1.1s boss slam for 4.47s. `slowUntil = simNow() + ms * scale` does not fix it
// either, because updatePace eases `scale` mid-beat.
//
// Put another way: pace is a real-time concern BY DEFINITION. It is the thing
// that makes sim time diverge from real time, so it is the one thing that
// cannot be measured on sim time. test/fixed-timestep.test.js pins this, and
// test/module-boundaries.test.js carries a named exemption for this file.
import { emit } from './emit.js';
import { performance } from './env.js';
import { onWorldReset } from './world.js';

// master game pace: 1 = original, <1 = calmer & more readable so the spectacle
// (combos, fusions, big spells) registers instead of flashing by. Tune to taste.
export const BASE_PACE = 0.85;

// The slowest pace slowMo will honour, and the floor content already uses —
// spells/starters.js:61 and spells/book.js:243 are the two 0.05 sites, and
// nothing asks for less. It is a clamp rather than a comment because applyFx
// hands msg.a straight to slowMo (src/net/client.js:256,266) from a table whose
// job is surviving a bug or a hostile server, and a pace of exactly 0 is
// unrecoverable under the fixed timestep: the accumulator gains nothing, so the
// step never fires, so updatePace never runs and the pace can never climb back.
// (Before Task 3 that self-healed — the ease ran per frame inside stepSim, not
// per tick.) Clamping here covers the host and the client alike: the host
// clamps as it applies the hitstop below and emits the RAW value it was asked
// for, exactly as the old broadcast wrapper did, and the receiving client
// clamps the relayed value again on its own way in.
const MIN_PACE = 0.05;

// Starts AT the base pace rather than easing down from 1. The old `= 1` was a
// leftover from before BASE_PACE existed, and it meant every fresh world ran
// ~15% fast for its first second. Harmless when it only scaled dt; as a tick-
// consumption rate it would make a just-rebuilt server outrun its own 60Hz.
let scale = BASE_PACE;
let slowUntil = 0;

export const paceScale = () => scale;

// THE DOCUMENTED EXCEPTION. slowMo is the one cosmetic that is also simulation:
// it changes how fast the tick loop consumes real time, so a sim that only
// EMITTED it would not actually slow down. It therefore does both — applies the
// hitstop here and queues the event — which is exactly what the deleted
// wrapServerFx did, promoted from a server-only monkeypatch to the definition.
//
// The renderer's handler for 'slowMo' is a deliberate no-op (src/render/fx.js):
// the local sim has already applied it, and applying it twice would restart the
// beat every frame. Only the wire consumer acts on the event, and the receiving
// client re-clamps it on its own way in (src/net/client.js).
export function slowMo(s, ms) {
  scale = Math.max(MIN_PACE, s);
  slowUntil = performance.now() + ms;
  emit('slowMo', s, ms);
}

export function updatePace() {
  if (performance.now() > slowUntil) scale += (BASE_PACE - scale) * 0.08; // ease back to the base pace, not full speed
}

onWorldReset(() => { scale = BASE_PACE; slowUntil = 0; });
