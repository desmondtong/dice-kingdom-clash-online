# Proposal: Build Game Server

**Change ID:** `build-game-server`
**Created:** 2026-10-22
**Status:** Implementation Complete — automated gates passed; coordinator runtime verification pending
**Completed:** 2026-10-22 (server track; smoke and idle measurement deferred to coordinator after merge by instruction at 16:50)
**Approval:** all decisions confirmed 2026-10-22: S-DEC-1 to S-DEC-7, option (a) each
**Track:** parallel, server (runs alongside `build-game-client`; see DESIGN.md 9)

---

## Problem Statement

The contracts are frozen (`openspec/specs/realtime-sync.md`, `shared/`), but nothing plays yet:

- `shared/rules.ts` and `shared/rng.ts` are stubs that throw `NotImplementedError`.
- `party/server.ts` is the scaffold placeholder that only says hello.

Without an authoritative room server there is no game: no rooms, seats, turns, dice or timers. The client track builds against fixtures in the meantime, and `integrate-and-verify` needs a working server to connect to.

## Proposed Solution

Two layers, both server-owned:

1. **Pure rules** (`shared/rules.ts`, `shared/rng.ts`): fill in the frozen signatures exactly as specified in DESIGN.md 1 and the doc comments in those files. No I/O, no timers, randomness only through the injected `Rng`.
2. **Room server** (`party/**`), split so it can be unit-tested without PartyKit:
   - `party/room.ts`: a `RoomController` class that holds all room logic: seats, the `connectionId → { playerId, seat }` map, intent validation, timers, version and eventId counters, and building the broadcast `RoomState`. It has **no PartyKit import**; it talks to an injected `Transport` (`send(connId, msg)`, `close(connId, code, reason)`), clock (`now()`), timer scheduler and `Rng`.
   - `party/server.ts`: a thin PartyKit adapter (`onConnect`, `onMessage`, `onClose`) that forwards to the controller with the real clock, `setTimeout` and `createCryptoRng()`.
   - Tests drive the controller with fake connections, a fake clock, fake timers and a scripted `Rng`, so every scenario is deterministic and fast.

A scripted two-client smoke run against `partykit dev` (two Node WebSocket clients playing a full match) confirms the adapter works in the real runtime.

### Server flow (from the contracts)

```
connect ─▶ welcome {seat, code} ─▶ state
lobby ── both ready ─▶ countdown (COUNTDOWN_MS) ─▶ playing
playing, per turn:
  power step (rounds 3, 6):  rollPower or timeout(auto) ─▶ applyPower ─▶ resolving (POWER_RESOLVE_MS) ─▶ advanceTurn("power")
  cannon step:               rollCannon ─▶ applyCannon ─▶ resolving (CANNON_RESOLVE_MS) ─▶ checkResult ─▶ advanceTurn("cannon") | finished
                             timeout ─▶ skipTurn ─▶ checkResult ─▶ advanceTurn("cannon")   (no window)
finished ── both rematch ─▶ countdown (match + 1, firstSeat alternates)
leave at any time ─▶ see S-DEC-1 / S-DEC-2
```

## Scope

### In Scope
- Implement every function in `shared/rules.ts` and `shared/rng.ts` (signatures unchanged).
- `party/room.ts` (controller), `party/server.ts` (adapter), and any small helper modules under `party/`.
- Create room / join room / reconnect / second tab / leave / ready / countdown / turns / Power and Cannon steps / timeouts / resolving windows / KO / round-8 result / rematch, per `realtime-sync.md`, DESIGN.md 1, 4, 5, 6 and D19.
- Unit tests: `tests/rules/**` (every rule) and `tests/server/**` (controller scenarios).
- A scripted two-client smoke script against `partykit dev`, kept under `tests/server/smoke/` and run manually (not part of `npm test`).
- Delta specs: `game-rules.md` (new) and `room-lifecycle.md` (new).

### Out of Scope
- Anything in `src/**`, `public/**`, `tests/client/**` (client track).
- Any change to frozen files: `shared/types.ts`, `shared/constants.ts`, `shared/protocol.ts`, `shared/errors.ts`, `shared/fixtures/**`, `tests/contracts/**`, configs, `package.json`. A needed change is a blocker (DESIGN.md 9.2).
- Next iteration (DESIGN.md 10): disconnect grace period and forfeit, persistence in `room.storage`, latency handling, spectators, "stay and invite someone new".

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Rules (`shared/rules.ts`, `shared/rng.ts`) | Yes | Stub bodies replaced; signatures frozen |
| Room server (`party/**`) | Yes | Placeholder replaced by controller + adapter |
| Protocol / types | No | Frozen; used as-is |
| Database | No | In-memory only (persistence is next iteration) |
| UI | No | Client track |
| Tests | Yes | `tests/rules/**`, `tests/server/**` |

## Architecture Considerations

- **Why a controller class without PartyKit imports:** PartyKit's `Room` and `Connection` are hard to fake fully, and timers inside the Workers runtime are slow to test. A plain class with injected transport, clock, timers and RNG makes each lifecycle scenario a short deterministic unit test, and keeps `party/server.ts` small enough to verify by the smoke run.
- **One timer per room.** At any time at most one of: countdown end, step deadline, resolving end. Each scheduled callback carries the `turnId` (or the countdown's version) it was created for and does nothing if the room has moved on, so a late timer can never act on a newer turn.
- **Broadcast state is built in one function** (`toRoomState`), which never reads `playerId`. A test asserts no broadcast message ever contains a `playerId`.
- **Counters:** `version` and `eventId` are per room and only ever increase, across rematches.
- **Fixtures as test oracles:** server tests compare produced states against the shapes in `shared/fixtures/` where they describe the same situation, and every broadcast state is checked with the same invariants as `tests/contracts/fixtures.test.ts` (imported, not copied).

## Cross-track Agreements (identical in both parallel proposals)

These are behaviours the contracts imply but do not spell out. Both tracks build to them; they are reviewed together.

| # | Situation | Server does | Client does |
|---|---|---|---|
| X1 | Connecting | Accepts PartySocket connections on party `main`, room id = room code, query `playerId`, `name`, `intent` | Connects to `localhost:1999`, party `main`, room = code, with those three query parameters |
| X2 | Known `playerId` | Treats it as a reconnect to its seat **whatever the `intent`**, keeps the original name, sends `welcome` + `state`; an older connection for that seat gets `REPLACED_BY_NEW_TAB` and is closed | On refresh or reconnect, always uses `intent=join` for a room it is already in |
| X3 | Create | `intent=create` on an existing room gets `CODE_TAKEN` (fatal) | Generates a new code and retries, up to 5 times, then shows an error |
| X4 | Fatal error | Sends `error`, then closes the connection | Stops PartySocket from reconnecting, shows a friendly message, offers Back to Home |
| X5 | Leave | Frees the seat (S-DEC-1/2), broadcasts the new state to the others, then closes the leaver's connection | Sends `leave`, closes its own socket without reconnecting, forgets the room in sessionStorage, goes to Home |
| X6 | After opponent left (D19) | `rematch` gets `INVALID_PHASE` | Hides Rematch; shows Back to Home only |
| X7 | Rematch | Both votes → `countdown` for match + 1 with `firstSeat` alternated; votes and ready flags reset | Shows the opponent's vote; the countdown overlay reuses the lobby countdown |
| X8 | Animations | Holds `resolving` for `POWER_RESOLVE_MS` / `CANNON_RESOLVE_MS` | Fits each animation inside its window; animates only on a new `lastEvent.eventId` |

## Decisions (confirmed 2026-10-22)

**S-DEC-1: Leave during `countdown`.**
- **(a) Recommended, confirmed:** the countdown is cancelled and the room returns to `lobby` with the remaining player (as host, not ready). No result, because no turn has been played.
- (b) Treat it like leaving a running match: the remaining player wins (reason `left`).

**S-DEC-2: When is a room discarded?**
- **(a) Recommended, confirmed:** when the last seat is freed by **Leave** (in any phase), the room is reset in memory, so its code can be created again. Seats held by disconnected players are **not** freed (a refresh must work; the grace-period forfeit is next iteration).
- (b) Never discard; codes are single-use while the server runs.

**S-DEC-3: Joining rules for a new `playerId`.**
- **(a) Recommended, confirmed:** `intent=join` → `ROOM_NOT_FOUND` if the room was never created; in `lobby`, the free seat (seat 2, or seat 1 if the host left and the guest became host); `ROOM_FULL` if the lobby is full; `GAME_IN_PROGRESS` in any other phase (including `finished`, per D19).

**S-DEC-4: Ready.** One-way (DEC-5). `ready` is accepted only in `lobby` with both seats filled; repeats are ignored without an error. When both are ready, the countdown starts at once. A disconnected player can still have their earlier ready flag count.
- **(a) Recommended, confirmed:** as above.
- (b) Ready flags reset when a player disconnects in the lobby.

**S-DEC-5: Disconnects during play.** The seat is held and `connected` is set to `false`; the turn timer keeps running (DESIGN.md 6), so a disconnected player's steps time out (Power auto-rolls, Cannon skips). The countdown also keeps running. Only the **current** connection of a seat can mark it disconnected (a replaced tab closing does not).
- **(a) Recommended, confirmed:** as above (this is the design; listed so the server behaviour is explicit).

**S-DEC-6: Room memory lifetime.** State is in memory only. If PartyKit unloads an idle room after everyone has disconnected, a later refresh gets `ROOM_NOT_FOUND`.
- **(a) Recommended, confirmed:** accept for the MVP and check how long `partykit dev` keeps an idle room during the smoke run; record the result. Persistence stays in the next iteration.
- (b) Add `room.storage` persistence now (scope increase).

**S-DEC-7: Close codes.** Fatal errors close with WebSocket code `4000` and the error code as the reason; a normal Leave closes with `1000`. The client must not rely on the close code (it already has the `error` message); this only makes logs readable.
- **(a) Recommended, confirmed:** as above.

## Success Criteria

- [x] Every rule in DESIGN.md 1 has unit tests: attack order (Ricochet then Shield), Shield rounding up, Ricochet kept on a Cannon timeout, Heal cap and the D12 distribution, Swap keeping statuses, KO including a self-KO by Ricochet, round-8 winner and tie, power rounds 3 and 6, first seat each round.
- [x] Controller tests cover every scenario in `realtime-sync.md` and `room-lifecycle.md` (the delta specs), including: wrong seat, wrong step, malformed message, double click, late click after a timeout, timer racing a click, refresh mid-turn, second tab, leave in each phase, rematch alternating `firstSeat`.
- [x] No broadcast state contains a `playerId`; every broadcast state passes the fixture invariant formulas, with the specified KO resolving exception for 0 HP (see tasks.md).
- [ ] **Deferred to coordinator after merge:** execute the implemented smoke script between two Node clients against `partykit dev` and confirm `finished`; also measure idle-room retention (tasks 4.3–4.4). Explicitly skipped on this track per instruction at 16:50 on 2026-10-22.
- [x] No frozen file changed (`git diff main -- shared/types.ts shared/constants.ts shared/protocol.ts shared/errors.ts shared/fixtures tests/contracts` is empty; all `rules.ts` / `rng.ts` exports and signatures verified unchanged with TypeScript ASTs).
- [x] All five quality gates pass after rebase onto coordinator correction `c734a8d`: 270/270 tests across seven test files.

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Timer callbacks race with clicks (a click arrives just as the deadline fires) | Med | High | Single-threaded per room; each timer checks its `turnId`; tests fire the timer and the click in both orders |
| A frozen signature turns out to be insufficient | Low | Med | Stop and raise a blocker (DESIGN.md 9.2); do not change it on the branch |
| PartyKit unloads idle rooms sooner than expected | Med | Low | S-DEC-6: measure during the smoke run, record it, and leave persistence for the next iteration |
| `setTimeout` behaviour differs between the Workers runtime and Node tests | Low | Med | Controller uses an injected scheduler; the smoke run checks real timers, including one timeout |
| Fake-transport tests miss an adapter bug | Low | Med | The adapter is small; the smoke run covers connect, messages, close and a full match |

---

## Archive Information

**Archived:** 2026-10-22 17:23
**Duration:** same day (proposal created and archived on 2026-10-22)
**Outcome:** Successfully implemented; merged into `main` in a parallel track

### Changes after approval

- Coordinator fix on `main` (`c734a8d`): the contract test that expected the rules/RNG stubs to throw was replaced, unblocking this track.
- Task 4.3 was run by the coordinator after merge; task 4.4 (idle-room retention) moved to `integrate-and-verify`. See `tasks.md`.

### Files Added or Modified

- `party/room.ts`
- `party/server.ts`
- `shared/rng.ts`
- `shared/rules.ts`
- `tests/rules/rng.test.ts`
- `tests/rules/rules.test.ts`
- `tests/server/helpers.ts`
- `tests/server/room.test.ts`
- `tests/server/server.test.ts`
- `tests/server/smoke/README.md`
- `tests/server/smoke/twoPlayers.ts`

### Specs Updated

- `openspec/specs/game-rules.md` (new)
- `openspec/specs/room-lifecycle.md` (new)
