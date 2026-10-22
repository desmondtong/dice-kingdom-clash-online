# Implementation Tasks: Build Game Server

**Change ID:** `build-game-server`
**Decisions:** S-DEC-1 to S-DEC-7, all confirmed as option (a) (see `proposal.md`)
**Worktree:** `../dice-kingdom-clash-online-worktrees/build-game-server` on `feature/build-game-server`
**Writes only:** `shared/rules.ts`, `shared/rng.ts` (bodies only), `party/**`, `tests/rules/**`, `tests/server/**`, this change's folder
**Dev port:** 1999 only (PartyKit); never start Vite

---

## Phase 0: Set up the track

- [ ] 0.1 From the main checkout: `git worktree add ../dice-kingdom-clash-online-worktrees/build-game-server -b feature/build-game-server main` (skip if the coordinator already created it)
- [ ] 0.2 In the worktree: `npm ci`, then run all five quality gates to confirm a clean start
- [ ] 0.3 Read `openspec/project.md`, `openspec/specs/realtime-sync.md`, `docs/DESIGN.md` sections 1 and 4 to 6, and the doc comments in `shared/rules.ts` and `shared/rng.ts`

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
