# Implementation Tasks: Build Game Server

**Change ID:** `build-game-server`
**Decisions:** S-DEC-1 to S-DEC-7, all confirmed as option (a) (see `proposal.md`)
**Worktree:** `../dice-kingdom-clash-online-worktrees/build-game-server` on `feature/build-game-server`
**Writes only:** `shared/rules.ts`, `shared/rng.ts` (bodies only), `party/**`, `tests/rules/**`, `tests/server/**`, this change's folder
**Dev port:** 1999 only (PartyKit); never start Vite

---

## Phase 0: Set up the track

- [x] 0.1 From the main checkout: `git worktree add ../dice-kingdom-clash-online-worktrees/build-game-server -b feature/build-game-server main` (skip if the coordinator already created it). Reused the coordinator's clean worktree and verified branch.
- [x] 0.2 In the worktree: `npm ci`, then run all five quality gates to confirm a clean start. Installation already done by coordinator; all five baseline gates passed on 2026-10-22 with the installed Node 26.2.0 (201 tests).
- [x] 0.3 Read `openspec/project.md`, `openspec/specs/realtime-sync.md`, `docs/DESIGN.md` sections 1 and 4 to 6, and the doc comments in `shared/rules.ts` and `shared/rng.ts`

---

## Phase 1: Random number helpers (`shared/rng.ts`)

- [ ] 1.1 `cryptoRandom()` on `crypto.getRandomValues` (uniform in [0, 1))
- [ ] 1.2 `rollDie`, `pickPower`, `healAmount` (D12, `random() = 0` mapped to 1), `randomTowerSeed`, `createCryptoRng`
- [ ] 1.3 `tests/rules/rng.test.ts`: boundaries with fixed inputs (0, just below 1), every die face and power reachable, Heal = 10 for inputs up to 0.5 and 11 to 20 above, `createCryptoRng` outputs in range over many draws

**Quality Gate:** typecheck, lint, tests

---

## Phase 2: Rules (`shared/rules.ts`)

- [ ] 2.1 `startMatch` (power step only if round 1 is a power round; `turnDeadline` 0)
- [ ] 2.2 `applyPower`: Shield, Ricochet, Heal (cap at MAX_HP, `healAmount` in the event), Swap (HP only); step `resolving`, new `turnId`
- [ ] 2.3 `applyCannon`: target (Ricochet consumed), Shield (ceil, consumed), HP floor at 0; event fields as in `CannonEvent`
- [ ] 2.4 `skipTurn` (Ricochet kept), `checkResult` (KO; rounds after the second seat's cannon in round 8; tie), `advanceTurn` (power → cannon, cannon → opponent or next round with `firstSeat`, power step in rounds 3 and 6)
- [ ] 2.5 `tests/rules/rules.test.ts`: every rule in DESIGN.md 1 with a scripted `Rng`, including self-KO by Ricochet, Shield halving a reflected hit, Swap with statuses, Heal at 45 HP capping at 50, a full 8-round match with `firstSeat` 2, and the result after each `completed` value
- [ ] 2.6 Every event produced passes the cannon/power consistency checks used in `tests/contracts/fixtures.test.ts` (import shared helpers if exposed, otherwise assert the same formulas)

**Quality Gate:** typecheck, lint, tests

---

## Phase 3: Room controller (`party/room.ts`)

- [ ] 3.1 Types for injected dependencies: `Transport` (`send`, `close`), `Clock` (`now`), `Scheduler` (`set(ms, fn) → handle`, `clear(handle)`), `Rng`
- [ ] 3.2 Connect: `parseConnectParams` → invalid → `INVALID_MESSAGE` + close (S-DEC-7); known `playerId` → reconnect (X2, `REPLACED_BY_NEW_TAB` for the old connection); create / join rules (S-DEC-3, X3); `sanitizeName`; `welcome` then `state`
- [ ] 3.3 Messages: `parseClientMessage` → `INVALID_MESSAGE`; unbound connection ignored; `ready` (S-DEC-4), `rollPower`, `rollCannon` (seat → `NOT_YOUR_TURN`, step → `INVALID_PHASE`, `turnId` → `STALE_ACTION`), `rematch` (X6, X7), `leave` (S-DEC-1, S-DEC-2, X5)
- [ ] 3.4 Timers: countdown end → `playing` + first step deadline; step deadline → auto power (D13) or `skipTurn`; resolving end → `checkResult` / `advanceTurn` / `finished`. One timer at a time; each callback checks its `turnId`
- [ ] 3.5 Close: only the seat's current connection marks it `connected: false` (S-DEC-5); timers keep running
- [ ] 3.6 `toRoomState()`: builds the broadcast state from server data, increments `version`, sets `serverNow`; never reads `playerId`
- [ ] 3.7 `tests/server/room.test.ts` with a fake transport, fake clock and scheduler, scripted RNG, covering every scenario in the two delta specs plus the cross-track agreements X1 to X8
- [ ] 3.8 A test helper asserts, for every message sent in every test, that it parses as a `ServerMessage`, contains no `playerId`, and (for `state`) passes the fixture invariants

**Quality Gate:** typecheck, lint, tests

---

## Phase 4: PartyKit adapter and smoke run

- [ ] 4.1 `party/server.ts`: create the controller with `Date.now`, `setTimeout` / `clearTimeout`, `createCryptoRng()`; forward `onConnect` (with `ctx.request.url`), `onMessage`, `onClose`; `Transport` over `room.getConnection(id)`
- [ ] 4.2 `tests/server/smoke/twoPlayers.ts`: two Node WebSocket clients create and join a room, ready up, play every step until `finished` (including letting one Cannon step time out), vote rematch, see the second match start, then one leaves. Run with `node` against `npm run dev:server`; prints a short transcript and exits 0 on success
- [ ] 4.3 Run the smoke script; also check: refresh mid-turn (reconnect with the same `playerId`), a second tab (`REPLACED_BY_NEW_TAB`), `CODE_TAKEN`, `ROOM_NOT_FOUND`, `GAME_IN_PROGRESS`
- [ ] 4.4 S-DEC-6: measure how long `partykit dev` keeps an idle room after all clients disconnect; record it in Implementation Notes

**Quality Gate:** all five gates; smoke run passes

---

## Phase 5: Docs and completion

- [ ] 5.1 Confirm no frozen file changed: `git diff main --stat -- shared/types.ts shared/constants.ts shared/protocol.ts shared/errors.ts shared/fixtures tests/contracts package.json package-lock.json *.config.* tsconfig*.json partykit.json` is empty, and `rules.ts` / `rng.ts` exports and signatures are unchanged
- [ ] 5.2 Sync the delta specs with what was built; record deviations and findings in Implementation Notes
- [ ] 5.3 Rebase onto `main`, run all five gates, push `feature/build-game-server`
- [ ] 5.4 Report to the coordinator for review and archive (server is merged first)

**Quality Gate (final):** `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check`, `npm run build`


## Implementation Notes — stopped at frozen-file blocker (2026-10-22)

Implementation exists in the owned files only: crypto RNG and pure rules (`shared/rng.ts`, `shared/rules.ts`), injected room controller and PartyKit adapter (`party/room.ts`, `party/server.ts`), deterministic tests (`tests/rules/**`, `tests/server/**`), and a reusable manual smoke driver (`tests/server/smoke/twoPlayers.ts`, with README). Frozen exports/signatures were retained. Tasks in phases 1–3 and adapter/script implementation are implemented, but their phase completion checkboxes remain pending because the integrated quality gate is blocked. No commit, rebase, push, merge, or archive has been performed.

### Verification so far

- Reused the coordinator's worktree and dependencies; branch is `feature/build-game-server`.
- The default shell selected Node 20.10.0. The already-installed pinned runtime `/Users/bytedance/.nvm/versions/node/v26.2.0/bin` was selected via PATH; no toolchain/config/dependency changes were made.
- All five baseline quality gates passed under Node 26.2.0 (201 tests).
- Integrated typecheck and lint passed.
- Integrated test output: **269 passed, 1 failed, 270 total**. All 17 new rule/RNG tests, 50 room-controller tests and 2 adapter tests passed. The sole assertion failure is the frozen stub test below.
- Integrated `format:check` and `build` were not reached after the failed test gate. Targeted formatting checks for the implemented files passed before integration.
- `git diff main` over frozen contracts, fixtures, tests, packages, and config files is empty.
- Snapshot tests reproduce the non-exported fixture invariant formulas. The sample-only assumption that all playing towers have positive HP is restricted to non-resolving steps: realtime-sync explicitly requires a 0-HP tower to remain visible during KO resolving. No fixture or contract test was edited.
- A timer-generation token supplements the frozen turnId: Power and Cannon resolving windows within one turn share `mN-rN-sN-resolving`, so token-only guards would not reject an old callback reliably.
- The manual smoke driver was not executed, and idle retention has not been measured. The attempted PartyKit start used port 1999 only, but local execution denied `listen` on `0.0.0.0` (`EPERM`); the process exited, and port 1999 has no listener. Vite was never started.
- The failing Vitest run additionally encountered a denied write to `/Users/bytedance/Library/Application Support/vitest`. Neither this access issue nor the server listen restriction was retried after the frozen-file blocker.

### Blocker B1 — obsolete test in a frozen file

`tests/contracts/protocol.test.ts:175–183` contains `describe("stubs")`. At line 177 it requires `startMatch(...)` to throw `NotImplementedError`; at line 180 it requires `createCryptoRng()` to throw an unimplemented-function error. Both functions must now return implemented values under this approved change, so the test cannot pass while preserving the frozen test file.

**Required coordinator action:** remove or update this implementation-stage-only stub test on `main` (including its now-unused imports if necessary), then authorize resuming/rebasing this server track. Do not weaken the implementation or bypass/skip the frozen test on the track branch. No frozen file was modified.

**Still pending:** resume after the coordinator correction; re-run all five gates; run the port-1999 smoke and idle-retention probe with the required local execution permission; synchronize completion docs; rebase as required; commit and push `feature/build-game-server`. No merge or archive is authorized on this track.
