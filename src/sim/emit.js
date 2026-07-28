// emit.js — the sim's only outward channel for things that are not simulation
// state: particles, screen shake, flashes, banners, sounds, kill-feed lines.
//
// Locally the renderer drains this queue once per frame (src/render/fx.js's
// applyEmitted); online src/net/server-bridge.js drains it once per tick and
// forwards the wire-visible names. One queue, so couch and online stop being
// two code paths — the fx monkeypatch that used to exist only server-side
// (wrapServerFx, deleted in task 13) is now the actual architecture.
//
// This module is a leaf: it imports nothing, so any sim module can emit without
// risking an import cycle. Ownership of the queue's lifetime therefore sits
// with its drainers — src/sim/match.js clears it on round load, and
// installServerBridge/uninstallServerBridge clear it around a sim's life.
const queue = [];

// `name` is the cosmetic's name; `args` are its call arguments, forwarded with
// the arity the caller used. Arity matters: the wire JSON-encodes `a`, and
// padding a trailing optional out to `undefined` would arrive as `null` and
// defeat the receiving function's default.
export function emit(name, ...args) {
  queue.push({ f: name, a: args });
}

// Takes the queue and leaves it empty, so two drainers can never both deliver
// the same event and a drainer that throws mid-apply cannot replay it.
export function drainEmitted() {
  const out = queue.slice();
  queue.length = 0;
  return out;
}

export const emittedCount = () => queue.length;

export function clearEmitted() { queue.length = 0; }
