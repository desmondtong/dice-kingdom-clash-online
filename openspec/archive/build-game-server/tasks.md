# Implementation Tasks: Build Game Server

**Change ID:** `build-game-server`
**Decisions:** S-DEC-1 to S-DEC-7, all confirmed as option (a) (see `proposal.md`)
**Worktree:** `../dice-kingdom-clash-online-worktrees/build-game-server` on `feature/build-game-server`
**Writes only:** `shared/rules.ts`, `shared/rng.ts` (bodies only), `party/**`, `tests/rules/**`, `tests/server/**`, this change's folder
**Dev port:** 1999 only (PartyKit); never start Vite
**Status:** Implementation complete; coordinator-owned runtime verification deferred by instruction on 2026-10-22 at 16:50.

---

## Phase 0: Set up the track

- [x] 0.1 Reuse the coordinator-created worktree and verify `feature/build-game-server`; do not recreate the worktree.
- [x] 0.2 Reuse the completed `npm ci`, then run all five baseline quality gates. Passed under Node 26.2.0 on 2026-10-22 (201 tests).
- [x] 0.3 Read `openspec/project.md`, `openspec/specs/realtime-sync.md`, `docs/DESIGN.md` sections 1 and 4 to 6, and the doc comments in `shared/rules.ts` and `shared/rng.ts`.

---

## Phase 1: Random number helpers (`shared/rng.ts`)

- [x] 1.1 `cryptoRandom()` on `crypto.getRandomValues` (uniform in [0, 1)).
- [x] 1.2 `rollDie`, `pickPower`, `healAmount` (D12, `random() = 0` mapped to 1), `randomTowerSeed`, `createCryptoRng`.
- [x] 1.3 `tests/rules/rng.test.ts`: fixed-input boundaries, every die face and power reachable, Heal distribution, and crypto RNG outputs in range.

**Quality Gate:** PASSED (included in all five post-rebase gates).

---

## Phase 2: Rules (`shared/rules.ts`)

- [x] 2.1 `startMatch` (initial step determined by power rounds; `turnDeadline` 0).
- [x] 2.2 `applyPower`: Shield, Ricochet, Heal with MAX_HP cap and rolled `healAmount` in the event, Swap of HP only; step `resolving`, new `turnId`.
- [x] 2.3 `applyCannon`: target (Ricochet consumed), Shield (ceil, consumed), HP floor at 0; consistent `CannonEvent` fields.
- [x] 2.4 `skipTurn` preserves Ricochet; `checkResult` handles KO, round-8 winner and tie; `advanceTurn` handles power → cannon, opponent/next round, first seat and power rounds 3/6.
- [x] 2.5 `tests/rules/rules.test.ts`: canonical rules with scripted RNG, self-KO, reflected Shield, Swap statuses, Heal cap, complete 8-round firstSeat-2 match, and completion-step results.
- [x] 2.6 Produced events pass the cannon/power consistency formulas from the non-exported frozen fixture tests.

**Quality Gate:** PASSED (included in all five post-rebase gates).

---

## Phase 3: Room controller (`party/room.ts`)

- [x] 3.1 Injected dependencies: `Transport`, `Clock`, `Scheduler`, `Rng`, and separate cosmetic tower-seed source.
- [x] 3.2 Connect validation, fatal errors and close codes, reconnect for known `playerId`, second-tab replacement, create/join rules, sanitised names, private `welcome` then `state`.
- [x] 3.3 Parsed intents; unbound connections ignored; ready/rematch/leave; seat, phase, step and stale-token validation. Stale tokens take priority after a transition so duplicates/late clicks get `STALE_ACTION`.
- [x] 3.4 Countdown, auto Power/skip Cannon deadlines, resolving, results and advancement. One timer at a time, with `turnId` plus timer-generation guards.
- [x] 3.5 Only the current connection marks a seat disconnected; timers keep running.
- [x] 3.6 Single `toRoomState()` builder reads public player data only, increments `version`, and sets `serverNow`.
- [x] 3.7 Fifty deterministic controller tests cover lifecycle, cross-track agreements, malformed intents, races, refresh/replacement, all leave phases, and rematch alternation.
- [x] 3.8 Every test-transport message is checked for protocol shape, JSON round-trip, identity-key absence, event consistency and state invariants.

**Quality Gate:** PASSED (included in all five post-rebase gates).

---

## Phase 4: PartyKit adapter and smoke run

- [x] 4.1 Thin `party/server.ts` adapter uses real clock, timers and crypto RNG; forwards connect/message/close/error; transports through `room.getConnection(id)`. Two adapter unit tests pass.
- [x] 4.2 Reusable manual `tests/server/smoke/twoPlayers.ts` driver and README: real two-client full match, first Cannon timeout, reconnect/replacement, fatal errors, rematch and Leave. Script implemented and statically checked; it is not a Vitest test and never starts a server.
- [x] 4.3 Smoke script and real-runtime lifecycle checks run by the coordinator on `main` after merge (2026-10-22 17:05, `node tests/server/smoke/twoPlayers.ts` against `npm run dev`): ROOM_NOT_FOUND, CODE_TAKEN, ROOM_FULL, GAME_IN_PROGRESS, mid-turn refresh and REPLACED_BY_NEW_TAB, first Cannon timeout, full match to KO (12 actions), rematch with seat 2 first, normal Leave with close 1000 all verified. Also checked in a real browser at 17:10 (two tabs: create, join by invite link, ready, countdown, turns, Power auto-roll, identical state on both screens).
- [x] 4.4 **Moved to `integrate-and-verify` (not measured).** The idle probe timed out at setup: after a client-initiated `close(1000)` the script waits for the close handshake, which the local PartyKit runtime did not complete within 10 s. Server-initiated closes work (Leave, above). No retention duration is claimed.

**Quality Gate:** All five automated gates PASSED. Real-runtime smoke/idle verification intentionally deferred, not passed or waived as an archive requirement.

---

## Phase 5: Docs and completion

- [x] 5.1 Confirm no frozen file differs from corrected `main`; compare all exported rules/RNG function signatures and exported types with TypeScript ASTs. Both checks passed.
- [x] 5.2 Synchronize owned delta-spec implementation notes and record findings, blocker resolution and deferred checks here.
- [x] 5.3 Commit preserved work, run `git rebase main`, pass all five gates, and push `feature/build-game-server`. Rebase onto `c734a8d` was conflict-free; implementation commit `9cad9ad` was pushed before this documentation handoff.
- [x] 5.4 Prepare coordinator handoff for review. Main, merge and archive remain coordinator-owned; no merge or archive performed.

**Quality Gate (final):** PASSED on 2026-10-22 after rebase: `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check`, `npm run build`.

---

## Implementation Notes

### Implementation and quality evidence

The server implementation is limited to owned files: crypto RNG and pure immutable rules in `shared/rng.ts` and `shared/rules.ts`; injected room controller and PartyKit adapter in `party/`; deterministic tests and the manual WebSocket driver in `tests/rules/` and `tests/server/`. There are no new dependencies, contract-signature changes, client edits or config edits.

The shell originally selected Node 20.10.0. All successful gates used the already-installed pinned Node 26.2.0 via `PATH=/Users/bytedance/.nvm/versions/node/v26.2.0/bin:$PATH`, with npm cache `/tmp/npm-cache-dkc`. No toolchain installation or configuration changes were needed. The five post-rebase gates passed with **270/270 tests across seven files**, including 17 rule/RNG tests, 50 controller tests and two adapter tests. `npm run build` runs a production Vite build; a Vite development server was never started.

Frozen fixture invariant helpers are not exported, so the owned test helper asserts the same formulas. The sample-fixture assumption that playing towers always have positive HP is restricted to non-resolving steps: `realtime-sync.md` explicitly requires a KO shot's 0-HP tower to remain visible during resolving. This does not change any contract or fixture.

A timer-generation token supplements the frozen `turnId`. Within a single turn, Power and Cannon resolving windows both use `mN-rN-sN-resolving`; a generation guard prevents an old Power callback from advancing the later Cannon window. Accepted rolls use `turnDeadline = now + resolve duration`; active Power/Cannon steps use `now + STEP_MS`, and finished matches use 0. Stale action tokens are checked before seat/step validation to preserve duplicate and late-click behavior after the room has advanced.

### Resolved blocker B1

The first integrated run had 269 passing tests and one failure because frozen `tests/contracts/protocol.test.ts` still asserted that `startMatch` and `createCryptoRng` throw unimplemented-function errors. Work stopped without editing that frozen file. The coordinator resolved it on `main` in **`c734a8d`**, then explicitly instructed this track to commit, rebase, test, defer smoke/idle checks, and push. The preserved work was committed as `6fc82e1`; the conflict-free `git rebase main` rewrote it to **`9cad9ad`**. The branch now includes the coordinator's correction, but its diff against `main` changes no frozen file. No blocker remains in the automated gates.

### Deferred real-runtime verification

**Per the coordinator's instruction at 16:50 on 2026-10-22, tasks 4.3 and 4.4 are deliberately not executed on this track. The coordinator will run PartyKit smoke testing and idle-room measurement after merge.** The implementation is ready for review, not yet manually/runtime verified for archive.

Before the earlier stop, the one attempted PartyKit startup used the required port 1999 but local execution denied `listen` on `0.0.0.0` (`EPERM`); the process exited and served nothing. The failing Vitest run also encountered a denied write to its user-level update/config path. No broad permission change, alternate dev port or server retry was used; subsequent successful automated gates ran with `CI=true`. On this resumed handoff no PartyKit or Vite server was started.

The manual driver is run with `node tests/server/smoke/twoPlayers.ts` against an independently started PartyKit server on port 1999. For an uninterrupted 65-second idle interval, use `DKC_SMOKE_IDLE_PROBES_MS=65000`. Default multi-probe reconnects can reset PartyKit's idle clock, so their cumulative elapsed time must not be interpreted as uninterrupted retention or an expiry policy. Persistence remains out of scope.

### Handoff

The feature branch is pushed to the existing GitHub origin and is based on corrected `main` at `c734a8d`. The coordinator retains all merge and archive responsibility. Runtime smoke and idle measurement remain explicitly pending after merge; all automated quality gates passed before handoff.
