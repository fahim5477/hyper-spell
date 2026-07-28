# HYPERSPELL session codes — design

Date: 2026-07-27
Status: approved

## Problem

Online play has no notion of a session. `server/serve.js` builds one `SimHost`
and one `Room` at startup, and whoever reaches the URL and clicks PLAY ONLINE is
in the match — there is nothing to start and nothing to share. The invite the
launcher copies to the clipboard is a bare URL, so "come play" and "watch our
match" are the same act, and a stranger on the tailnet lands in a live round.

The ask: a host starts a session and shares a unique code; others join with it.

A scan of the multiplayer system (`server/serve.js`, `server/room.js`,
`server/sim-host.js`, `src/net/server-bridge.js`, `src/net/client.js`,
`src/platform/menu.js`) also turned up six defects, listed under
"Fixes folded in" below. They are fixed in this branch because four of them sit
in the code paths the feature rewrites.

## The constraint that shapes the design

**The simulation is process-global, not instance-based.** `players`, `game`, the
Matter world, and `serverControllers`/`undoWrap` in `src/net/server-bridge.js`
are module-level singletons; that file already warns that "a second sim in the
same process must not wrap the wrappers". Two concurrent matches in one process
would need a worker thread per room (fresh module registry) or an
instance-context rewrite of all of `src/sim`.

So: **one match per server, and the code gates it.** Concurrent sessions are out
of scope. This also fits how the game is actually run — `scripts/hyperspell-launcher.command`
starts a server per group.

## Goals

1. A host starts a session and gets a short code that is easy to read aloud and
   easy to paste into Slack.
2. Nobody reaches the match — not even as a spectator — without that code.
3. A session ends cleanly, and the next person can host without restarting the
   server.
4. The six review findings are fixed, with tests.

## Non-goals

- Concurrent matches, a lobby browser, matchmaking, or accounts. (See
  `docs/MULTIPLAYER.md` for the long-term Option A plan.)
- Host-only lobby authority. Lobby controls stay shared: anyone in the room can
  press SPACE / B / M / R / 1-9, exactly as today.
- Replacing `GAME_KEY`. It stays the outer HTTP/WS gate; the session code is the
  inner match gate. They compose and neither knows about the other.

## The session

```
{ code, hostConnId, createdAt }
```

Owned by `Room`, at most one at a time.

**Code format.** Six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32
symbols, no `I`/`O`/`0`/`1`), drawn with `crypto.randomInt`, displayed as
`ABC-DEF`. ~1.07e9 combinations, which is irrelevant to guessing (the room is
also `GAME_KEY`-gated when exposed) and everything to do with being readable
over a desk. `normalizeCode()` uppercases and strips non-alphanumerics, so
`abc-def`, `ABC DEF` and `abcdef` are the same code.

**Lifecycle.**

| Event | Result |
|---|---|
| First `{t:'host'}` | mints the code, replies `session{code, host:true}` |
| Any later `{t:'host'}` | `sessionDenied{reason:'exists'}` |
| `{t:'join', code}` matching | `session{code}` and a seat (or a reservation, or `joinDenied{reason:'full'}`) |
| `{t:'join', code}` wrong/absent | `joinDenied{reason:'code'}` |
| Room empty for `EMPTY_RESET_MS` (60s) | reset to lobby, clear the code |

A matching code is what grants access, so a correct code into a full match still
authorizes the connection: you get `session{code}`, you see the match, and you
spectate until a seat opens — the behavior a codeless spectator has today.

**Two deviations from the brainstorm, decided while planning.** There is no
`endSession` message: no screen would drive it, and the empty-room rule already
ends sessions, so it would be dead protocol surface. And the host is not
recorded — nothing in the design authorizes anything by host identity, since
lobby controls are shared by choice. `session{host:true}` remains only as a hint
to the minting client's own menu, telling it to show the code panel.

**Spectators.** Today every connected socket receives snapshots whether or not
it joined. A code that still let you watch would be decorative, so snapshots and
fx now go only to connections that presented the code. One exception:
stale-version connections keep receiving snapshots, because that is how the
existing "GAME UPDATED — REFRESH THE PAGE" screen is triggered client-side
(`src/net/client.js` renders it on a `snap.v` mismatch), and such a connection
cannot join or send input anyway. This is a small, deliberate hole: someone
running a build one version behind can watch without a code.

## Protocol (`proto` 2 → 3)

| Direction | Message | Notes |
|---|---|---|
| S→C | `welcome{v, proto:3, st, session:bool}` | `session` lets the menu render HOST vs JOIN with no extra round trip |
| C→S | `host{}` | → `session{code, host:true}` or `sessionDenied{reason:'exists'}` |
| C→S | `join{name, code}` | → `you{slot}` + `session{code}`, or `joinDenied{reason:'code'\|'full'}` |
| S→C | `session{code, host?}` | also the answer to a successful join |
| S→C | `sessionDenied{reason}` | |
| S→C | `sessionState{live}` | broadcast when a session opens or ends, so a menu waiting on the other screen flips itself |

Existing messages are unchanged. `proto` is bumped because `join` gains a
required field; `GAME_VERSION` is not touched (the sim did not change).

## Components

**`server/session-code.js`** (new, ~25 lines). `mintCode()` and
`normalizeCode(s)`. No dependencies, unit-tested on its own.

**`server/room.js`.** Holds the session, gates `join`, and answers `host` /
`endSession`. Its per-socket `Session` class is renamed `Conn` so that "session"
means one thing in this file. `broadcast` gains the authed check.

**`server/sim-host.js`.** Gains `setHandlers({onSnapshot, onFx, onCrash,
onPackUnlocked})`; `Room` no longer mutates `simHost.opts` from outside.

**`src/net/server-bridge.js`.** Exposes `cleanName` on the command surface, so
the room sanitizes names with the sim's own definition instead of a copy.

**`src/net/client.js`.** `hostSession()`, `joinSession(code)`, handlers for
`session` / `sessionDenied` / `joinDenied{reason:'code'}`, and the active code
exported for the lobby HUD.

**`src/platform/menu.js`.** A second screen after connecting: **START SESSION**
when none is live, a code box when one is. Hosting shows the code large with a
copy button yielding `http://<host>:<port>/?code=ABC-DEF`. A `?code=` in the
page URL prefills and joins on click. The code is kept in `sessionStorage` so a
mid-match refresh rejoins without retyping (pairing with the name-based seat
reservation).

**`src/net/client.js` lobby panel.** The active code is drawn in the online
lobby so anyone in the room can read it out.

## Fixes folded in

0. **`myName` is undefined — online play is broken.** `src/net/client.js` calls
   `myName()` at lines 118, 139 and 284; nothing in the repository defines it,
   and `dist/hyperspell.js` carries the same three unresolved references. The
   ESM refactor (`226341b`) dropped the helper — `cleanName` and `ensureAudio`
   are still imported into that file and otherwise unused, which is what it
   consumed. So `ws.onopen` throws before `hello` is sent, `welcome` throws
   after flipping `netMode` to `'online'` and removing the menu (leaving a
   seatless spectator the server will not seat, because `room.js` requires
   `hello`), and the join retry throws out of `netClientFrame` every frame.
   `server/verify-e2e.js` cannot see this: it builds raw WebSocket frames and
   never loads the client. Fix: restore `myName()` over the `hs-name-0` key the
   menu writes, and add a test that fails on any unresolved identifier in the
   built bundle so the next deletion is caught.
1. **High-refresh input drop.** `MSG_WINDOW_MAX` (600 per 5s) was sized for
   "input at 60Hz is 300/5s", but `sendInput` runs once per rendered frame, so a
   144Hz display sends 720/5s and `handle()` silently drops the overflow —
   including lobby verbs. Fix: separate budgets, a generous one for `input`
   (sized for 300Hz) and a strict one for commands.
2. **Unvalidated input reaches physics.** `room.js` forwards `{m,j,c,c2,b,a}`
   verbatim and `src/sim/player/controller.js` computes `move * 6` into
   `setVelocity`. A non-finite `m` or `a` poisons body state, spreads NaN through
   collisions, and trips the crash watchdog — resetting everyone's match. Fix:
   clamp `m` to [-1,1] with non-finite → 0, coerce `j/c/c2/b` to 0/1, and require
   `a` to be finite or null, at the room boundary.
3. **Join retries flood at frame rate.** `src/net/client.js` re-emits `join`
   every frame while cast is held and unjoined. Fix: edge-trigger it with a 1s
   floor, and stop the server from repeating an unchanged `joinDenied` more than
   once a second.
4. **The documented reconnect window does not exist.** README and `RESERVE_MS`
   promise two minutes to reclaim a seat and its round wins, but the
   round-boundary sweep in `onSnapshot` removes the shell and the reservation at
   the end of the current round (often ~30s). Fix: the sweep skips slots whose
   reservation is still live, and prunes expired ones.
5. **`session.name` is never sanitized.** `join` takes `msg.name` raw for the
   reservation key and for `bridge.reset(session.name)`, which broadcasts it as a
   banner. Fix: run it through the bridge's `cleanName`.
6. **Wiring.** `Room` mutates `simHost.opts` after construction; `Room.destroy()`
   exists but is never called, leaking its 10s stats interval. Fix:
   `setHandlers()`, and `serve.js` calls `room.destroy()` on SIGINT/SIGTERM.

## Testing

`server/` has no automated coverage today — only `server/verify-e2e.js`, which
spawns the real server and takes minutes.

**`test/room.test.js`** (new, `node --test`, no network and no sim): drives
`Room` against a fake bridge and fake sockets.

- a code is minted on `host`; a second `host` is denied
- join without a code, and with a wrong code, is denied; a correct code in any
  case/spacing is admitted
- a connection that never presented the code receives no snapshots
- `m: NaN`, `m: 1e9`, `m: '3'`, `a: NaN` are clamped before reaching the bridge
- a 144Hz input stream survives 5 seconds; a command flood does not
- a reservation survives a round boundary for `RESERVE_MS` and is swept after
- the session ends when the room empties, and a new host mints a different code

**`test/session-code.test.js`** (new): alphabet, format, and `normalizeCode`
round-trips.

**`server/verify-e2e.js`**: a real-socket phase for host → code → join, wrong
code refused, and no snapshots before the code.

## Docs

README's online section, `docs/MULTIPLAYER.md` (status line — private codes move
from "still open" to shipped), and the invite text in
`scripts/hyperspell-launcher.command` / `.bat`, which currently tells players
that clicking PLAY ONLINE puts them straight in.

## Risks

- **A player who does not read.** The code is one more step between a URL and a
  fight. Mitigated by `?code=` links: the launcher's clipboard invite carries it,
  so the common path is still one click.
- **Behavior change for existing spectators.** Anyone relying on connecting
  without joining to watch now needs the code. Stated above, and in the README.
