# Implementation Tasks: Define Game Contracts

**Change ID:** `define-game-contracts`
**Branch:** `feature/define-game-contracts`
**Decisions:** DEC-1a, DEC-2a, DEC-3, DEC-4, DEC-5, DEC-6, all confirmed (see `proposal.md`)

---

## Phase 1: Types and Constants

- [ ] 1.1 Create the branch `feature/define-game-contracts` from an up-to-date `main`
- [ ] 1.2 `shared/types.ts`: `Seat`, `Phase`, `Step`, `Power`, `TowerState`, `MatchState`, `PlayerInfo`, `RoomState`, `GameEvent` (`cannon`, `power`, `turnSkipped`), `MatchResult` (`winner: Seat | "tie"`, `reason: "ko" | "rounds" | "left"`), `ErrorCode` (9 codes, DEC-3), `ClientMessage` (`ready`, `rollPower`, `rollCannon`, `rematch`, `leave`), `ServerMessage` (`welcome`, `state`, `error`, per DEC-1/DEC-2), `ConnectParams` (`playerId`, `name`, `intent`), `Rng`
- [ ] 1.3 `shared/constants.ts`: `MAX_HP = 50`, `ROUNDS = 8`, `POWER_ROUNDS = [3, 6]`, `STEP_MS`, `COUNTDOWN_MS`, `POWER_RESOLVE_MS`, `CANNON_RESOLVE_MS` (DEC-4), `HEAL_MIN = 10`, `HEAL_MAX = 20`, `ROOM_CODE_LENGTH = 4`, `ROOM_CODE_ALPHABET` (no 0/O, 1/I/L), `NAME_MAX_LENGTH = 12`, `FATAL_ERROR_CODES`
- [ ] 1.4 TSDoc comment on every exported type and field, stating units (ms, epoch ms) and who sets it (server only)

**Quality Gate:**
- [ ] `npm run typecheck` passes (browser and server projects)
- [ ] `npm run lint` passes

---

## Phase 2: Protocol Helpers and Rule Signatures

- [ ] 2.1 `shared/protocol.ts`: `parseClientMessage(raw: string): ClientMessage | null` (never throws), `parseConnectParams(url: URL): ConnectParams | null`, `sanitizeName(raw, seat)` (DEC-5), `limitNameInput(raw)` (cut to `NAME_MAX_LENGTH` characters without trimming, for the client's input box), `isFatalError(code)`, `makeTurnId(match, round, seat, step)` (DEC-5), `opponent(seat)`. Character counting uses `Intl.Segmenter` (graphemes), so an emoji counts as one
- [ ] 2.2 `shared/rules.ts` signatures with TSDoc describing the rule each one implements (DESIGN.md section 1): `startMatch`, `applyPower`, `applyCannon`, `skipTurn`, `advanceTurn`, `checkResult`. Bodies throw `NotImplementedError` (DEC-6)
- [ ] 2.3 `shared/rng.ts` signatures: `createCryptoRng(): Rng`, `rollDie`, `pickPower`, `healAmount` (D12 distribution in TSDoc). Bodies throw `NotImplementedError`
- [ ] 2.4 `tests/contracts/protocol.test.ts`: a table of valid and invalid inputs for `parseClientMessage` (bad JSON, unknown type, missing or non-string `turnId`, extra fields, arrays, `null`) and `parseConnectParams`; `sanitizeName` and `limitNameInput` cases (spaces, empty, long, emoji, never splitting an emoji); `makeTurnId` format; `opponent`

**Quality Gate:**
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes

---

## Phase 3: Fixtures

- [ ] 3.1 `shared/fixtures/` with typed, named `RoomState` samples, exported from `shared/fixtures/index.ts`:
  - `lobbyWaiting` (host only), `lobbyBothJoined` (one ready), `lobbyOpponentDisconnected`
  - `countdown`
  - `playingPowerStep` (round 3), `playingCannonStep`, `resolvingPower` (with a `power` event, e.g. Heal), `resolvingCannon` (with a `cannon` event, reflected and shielded), `resolvingTurnSkipped`
  - `playingWithStatuses` (Shield and Ricochet active), `playingOpponentDisconnected`
  - `finishedKo`, `finishedRoundsWin`, `finishedTie`, `finishedLeft`, `finishedRematchVoted` (one vote)
- [ ] 3.2 A matching `welcome` sample for each seat, and one sample `error` message per error code
- [ ] 3.3 `tests/contracts/fixtures.test.ts`: every fixture passes the invariants (HP in 0..50; `match` is `null` only in `lobby`; `result` is set only in `finished`; `currentSeat` is a filled seat; `step === "power"` only in `POWER_ROUNDS`; `turnId` matches `makeTurnId`; `lastEvent` is set in every `resolving` fixture; no field named `playerId` anywhere in a broadcast state)

**Quality Gate:**
- [ ] `npm test` passes
- [ ] Every `Phase` and `Step` value is covered by at least one fixture (checked by a test)

---

## Phase 4: Spec and Documentation

- [ ] 4.1 Delta spec `specs/realtime-sync_delta.md` matches the final code (message names, error codes, constants)
- [ ] 4.2 Update `docs/DESIGN.md`: 2.1 (`welcome`, no `playerId` in state), 2.2 (message table, 9 error codes, fatal column), 4 (event delivery via `lastEvent`), 8 and 9.1 (`shared/protocol.ts`, `tests/contracts/` owned by this change and read-only during the parallel phase)
- [ ] 4.3 Update `openspec/project.md`: folder structure, error-code list, read-only files during the parallel phase

**Quality Gate:**
- [ ] All of: `npm run typecheck && npm run lint && npm test && npm run format:check && npm run build`
- [ ] Documentation synced

---

## Completion Checklist

- [ ] All phases complete
- [ ] All quality gates passed
- [ ] Documentation synced
- [ ] Ready for `/openspec-archive define-game-contracts`
