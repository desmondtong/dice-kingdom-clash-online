# Implementation Tasks: Define Game Contracts

**Change ID:** `define-game-contracts`
**Branch:** `feature/define-game-contracts`
**Decisions:** DEC-1a, DEC-2a, DEC-3, DEC-4, DEC-5, DEC-6, all confirmed (see `proposal.md`)

---

## Phase 1: Types and Constants

- [x] 1.1 Create the branch `feature/define-game-contracts` from an up-to-date `main`
- [x] 1.2 `shared/types.ts`: `Seat`, `Phase`, `Step`, `Power`, `TowerState`, `MatchState`, `PlayerInfo`, `RoomState`, `GameEvent` (`cannon`, `power`, `turnSkipped`), `MatchResult` (`winner: Seat | "tie"`, `reason: "ko" | "rounds" | "left"`), `ErrorCode` (9 codes, DEC-3), `ClientMessage` (`ready`, `rollPower`, `rollCannon`, `rematch`, `leave`), `ServerMessage` (`welcome`, `state`, `error`, per DEC-1/DEC-2), `ConnectParams` (`playerId`, `name`, `intent`), `Rng`
- [x] 1.3 `shared/constants.ts`: `MAX_HP = 50`, `ROUNDS = 8`, `POWER_ROUNDS = [3, 6]`, `STEP_MS`, `COUNTDOWN_MS`, `POWER_RESOLVE_MS`, `CANNON_RESOLVE_MS` (DEC-4), `HEAL_MIN = 10`, `HEAL_MAX = 20`, `ROOM_CODE_LENGTH = 4`, `ROOM_CODE_ALPHABET` (no 0/O, 1/I/L), `NAME_MAX_LENGTH = 12`, `FATAL_ERROR_CODES`
- [x] 1.4 TSDoc comment on every exported type and field, stating units (ms, epoch ms) and who sets it (server only)

**Quality Gate:**
- [x] `npm run typecheck` passes (browser and server projects)
- [x] `npm run lint` passes

---

## Phase 2: Protocol Helpers and Rule Signatures

- [x] 2.1 `shared/protocol.ts`: `parseClientMessage(raw: string): ClientMessage | null` (never throws), `parseConnectParams(url: URL): ConnectParams | null`, `sanitizeName(raw, seat)` (DEC-5), `limitNameInput(raw)` (cut to `NAME_MAX_LENGTH` characters without trimming, for the client's input box), `isFatalError(code)`, `makeTurnId(match, round, seat, step)` (DEC-5), `opponent(seat)`. Character counting uses `Intl.Segmenter` (graphemes), so an emoji counts as one
- [x] 2.2 `shared/rules.ts` signatures with TSDoc describing the rule each one implements (DESIGN.md section 1): `startMatch`, `applyPower`, `applyCannon`, `skipTurn`, `advanceTurn`, `checkResult`. Bodies throw `NotImplementedError` (DEC-6)
- [x] 2.3 `shared/rng.ts` signatures: `createCryptoRng(): Rng`, `rollDie`, `pickPower`, `healAmount` (D12 distribution in TSDoc). Bodies throw `NotImplementedError`
- [x] 2.4 `tests/contracts/protocol.test.ts`: a table of valid and invalid inputs for `parseClientMessage` (bad JSON, unknown type, missing or non-string `turnId`, extra fields, arrays, `null`) and `parseConnectParams`; `sanitizeName` and `limitNameInput` cases (spaces, empty, long, emoji, never splitting an emoji); `makeTurnId` format; `opponent`

**Quality Gate:**
- [x] `npm test` passes
- [x] `npm run typecheck` passes

---

## Phase 3: Fixtures

- [x] 3.1 `shared/fixtures/` with typed, named `RoomState` samples, exported from `shared/fixtures/index.ts`:
  - `lobbyWaiting` (host only), `lobbyBothJoined` (one ready), `lobbyOpponentDisconnected`
  - `countdown`
  - `playingPowerStep` (round 3), `playingCannonStep`, `resolvingPower` (with a `power` event, e.g. Heal), `resolvingPowerAuto` (Swap after a Power-step timeout), `resolvingCannon` (with a `cannon` event, reflected and shielded), `playingAfterTurnSkipped` (see N3)
  - `playingWithStatuses` (Shield and Ricochet active), `playingOpponentDisconnected`
  - `finishedKo`, `finishedRoundsWin`, `finishedTie`, `finishedLeft`, `finishedRematchVoted` (one vote)
- [x] 3.2 A matching `welcome` sample for each seat, and one sample `error` message per error code
- [x] 3.3 `tests/contracts/fixtures.test.ts`: every fixture passes the invariants (HP in 0..50; `match` is `null` only in `lobby`; `result` is set only in `finished`; `currentSeat` is a filled seat; `step === "power"` only in `POWER_ROUNDS`; `turnId` matches `makeTurnId`; `lastEvent` is set in every `resolving` fixture; no field named `playerId` anywhere in a broadcast state)

**Quality Gate:**
- [x] `npm test` passes
- [x] Every `Phase` and `Step` value is covered by at least one fixture (checked by a test)

---

## Phase 4: Spec and Documentation

- [x] 4.1 Delta spec `specs/realtime-sync_delta.md` matches the final code (message names, error codes, constants)
- [x] 4.2 Update `docs/DESIGN.md`: 2.1 (`welcome`, no `playerId` in state), 2.2 (message table, 9 error codes, fatal column), 4 (event delivery via `lastEvent`), 8 and 9.1 (`shared/protocol.ts`, `tests/contracts/` owned by this change and read-only during the parallel phase)
- [x] 4.3 Update `openspec/project.md`: folder structure, error-code list, read-only files during the parallel phase

**Quality Gate:**
- [x] All of: `npm run typecheck && npm run lint && npm test && npm run format:check && npm run build`
- [x] Documentation synced

---

## Completion Checklist

- [x] All phases complete
- [x] All quality gates passed
- [x] Documentation synced
- [x] Ready for `/openspec-archive define-game-contracts`

---

## Implementation Notes (2026-10-22)

### Additions and refinements beyond the proposal

These came up while turning the design into code. None changes a confirmed decision; please review them before archiving.

| # | Item | Why |
|---|---|---|
| N1 | New field `RoomState.countdownEndsAt` (epoch ms, non-null only in `countdown`); the match about to start is already in `match` during the countdown | The client needs a deadline to show "3-2-1" with the same clock offset as the turn timer |
| N2 | `RoomState.created` from DESIGN.md 2.1 is **not** in the broadcast state | It would always be `true` in any state a client can receive; whether a room exists is server-only data |
| N3 | A skipped turn (Cannon timeout) has **no resolving window**: the server sets `lastEvent` to `turnSkipped` and moves straight to the next turn. The planned fixture `resolvingTurnSkipped` became `playingAfterTurnSkipped` | DEC-4 defines windows only for Power and Cannon rolls; there is nothing to animate except a toast |
| N4 | Rule signatures: `checkResult(match, completed)` and `advanceTurn(match, completed)` take `completed: "power" \| "cannon"`; `skipTurn(match)` added | The rules are pure and cannot see `lastEvent`, so they need to be told which step just finished. The server flow is documented at the top of `shared/rules.ts` |
| N5 | `shared/rng.ts`: the dice helpers take a `RandomSource` (`() => number` in [0, 1)); added `cryptoRandom()` and `randomTowerSeed()` | Lets `build-game-server` unit-test the distributions (e.g. Heal = 10 half the time) with fixed inputs |
| N6 | New file `shared/errors.ts` (`NotImplementedError`), frozen like the other contracts | Both stub files need it (DEC-6) |
| N7 | New constants: `PLAYER_ID_PATTERN` (8 to 64 of `A-Z a-z 0-9 _ -`; `crypto.randomUUID()` fits), `TURN_ID_MAX_LENGTH` (64), `MAX_MESSAGE_LENGTH` (1024) | Bounds on untrusted input, so a hostile client cannot send huge or odd values |
| N8 | `parseClientMessage` **strips** unknown fields instead of rejecting the message | Matches the spec ("the server ignores those fields") and keeps clients forward-compatible |

### Verification

| Check | Result |
|---|---|
| `Intl.Segmenter` in PartyKit's runtime (proposal risk) | Available. A temporary placeholder server ran `sanitizeName` and `limitNameInput` inside `partykit dev`: 13 skin-toned thumbs → 12, a family emoji kept whole, tabs/newlines → `Player 2`. Same results as Node. The temporary server change was reverted (not committed) |
| Bug caught by the tests | `sanitizeName` removed control characters before collapsing whitespace, so tabs and newlines vanished instead of becoming spaces. Fixed by collapsing whitespace first |
| Mutation check of the fixture invariants | Three deliberate fixture bugs were each caught: wrong Shield damage (1 failure), a leaked `playerId` (17 failures, one per fixture), the only Swap event removed (coverage failure). The fixtures file was restored byte-for-byte |
| Tests | 201 passing: 60 protocol tests, 139 fixture tests (8 invariants × 17 fixtures, plus 3 coverage tests), 2 existing client smoke tests. All five quality gates pass |

### Open question for `build-game-server` (not a contract change)

After an opponent leaves mid-match, DESIGN.md 6 says the remaining player "returns to the lobby as host to invite someone new". There is no intent for that step, and the contract does not need one yet: the server can move the room from `finished` to `lobby` when a new player joins the free seat, or a later change can add an intent. To decide in the `build-game-server` proposal.
