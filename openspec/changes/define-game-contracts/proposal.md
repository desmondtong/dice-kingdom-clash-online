# Proposal: Define Game Contracts

**Change ID:** `define-game-contracts`
**Created:** 2026-10-22
**Status:** Ready for approval (all decisions confirmed: DEC-1a, DEC-2a, DEC-3, DEC-4, DEC-5 with client input limit, DEC-6)

---

## Problem Statement

The next two changes, `build-game-server` and `build-game-client`, run in parallel (D15). They can only work independently if they agree in advance on everything that crosses the network: the shape of the room state, the messages in both directions, the error codes, the timing constants and the rule-function signatures. If they do not, each track will guess, and `integrate-and-verify` turns into rework.

`docs/DESIGN.md` sections 2, 4 and 5 describe these contracts in prose. While turning them into code, four gaps showed up that would cause bugs or security holes if left to each track:

| # | Gap in DESIGN.md | Why it matters |
|---|---|---|
| G1 | A client has no way to learn **which seat it is**. `RoomState.players` has no `playerId` (correctly), and nothing else tells a connection "you are seat 2" | The client cannot show "You", enable its own buttons, or tell whose turn it is |
| G2 | The protocol has **both** an `event` message and `RoomState.lastEvent` | Two sources for the same fact. Messages on one connection arrive in order, but the client would have to hold each `event` until the matching `state` arrives, and still read `lastEvent` after a refresh or reconnect (missed `event` messages are not resent). That means two code paths for the same animation and a risk of playing it twice |
| G3 | Malformed or unknown messages have **no error code** | The server would either crash, ignore silently, or each track invents its own code |
| G4 | Resolving windows are "about 2 s" and "about 1.5 s plus the crumble"; the countdown length and nickname limits are not fixed | Server timers and client animations must use the same numbers, or the two sides drift |

## Proposed Solution

Write the contracts as TypeScript in `shared/`, freeze them, and describe the obligations of both sides in a new spec, `realtime-sync.md`.

| File | Contents | Implemented here? |
|---|---|---|
| `shared/types.ts` | `Seat`, `Phase`, `Step`, `Power`, `TowerState`, `MatchState`, `RoomState`, `GameEvent`, `MatchResult`, `ClientMessage`, `ServerMessage`, `ErrorCode`, `ConnectParams`, `Rng` | Yes (types only) |
| `shared/constants.ts` | `MAX_HP`, `ROUNDS`, `POWER_ROUNDS`, `STEP_MS`, `COUNTDOWN_MS`, resolve windows, heal range, room-code alphabet and length, nickname limits, `FATAL_ERROR_CODES` | Yes |
| `shared/protocol.ts` | `parseClientMessage(raw)`, `parseConnectParams(url)`, `sanitizeName(raw)`, `isFatalError(code)`, `makeTurnId(...)`, `opponent(seat)` | Yes, with tests. These are small, pure and needed identically by both sides, so freezing a tested implementation is safer than freezing only a signature |
| `shared/rules.ts` | `startMatch`, `applyPower`, `applyCannon`, `skipTurn`, `advanceTurn`, `checkResult` | **Signatures only.** Bodies throw `NotImplementedError`; `build-game-server` implements them |
| `shared/rng.ts` | `createCryptoRng(): Rng`, `rollDie`, `pickPower`, `healAmount` | **Signatures only**, same as above |
| `shared/fixtures/` | Typed sample `RoomState`s for every phase and step (list in tasks.md) | Yes |
| `tests/contracts/` | Fixture invariant tests and `protocol.ts` tests | Yes |

### Decisions (confirmed 2026-10-22)

**DEC-1. How a client learns its seat (G1).**
- **(a) Recommended, confirmed:** after every successful connect or reconnect, the server sends a private `welcome` message `{ type: "welcome", seat, code }` to that connection only. `playerId` is **never** included in any broadcast. (If it were, the opponent could copy it, connect with it and take over the seat.)
- (b) Send a different `state` to each connection, with an extra `yourSeat` field. This works, but makes every broadcast per-connection and mixes private data into the shared state.

**DEC-2. Event delivery (G2).**
- **(a) Recommended, confirmed:** one message type, `state`, carrying the full snapshot. The animation trigger is `state.lastEvent`; a client animates when `lastEvent.eventId` is higher than the last one it played. The animation and the HP it lands on always arrive in the same message, and refresh or reconnect uses the same code path as normal play. Version filtering covers both. Ephemeral messages that do not change state (e.g. emotes, next iteration) can be added later as a new message type without changing this.
- (b) Keep the separate `event` message from DESIGN.md 2.2. Each client must then hold every `event` until its `state` arrives, and also handle a reconnect that receives only `state`.

**DEC-3. Invalid messages (G3).** Add one error code, **`INVALID_MESSAGE`**, for messages that are not valid JSON, have an unknown `type`, or have wrong field types. It is **non-fatal**: the server replies with the error, changes nothing and keeps the connection open. The full list is then 9 codes:

| Code | Fatal (server closes the connection) | When |
|---|---|---|
| `ROOM_NOT_FOUND` | Yes | `intent=join` to a room that was never created |
| `CODE_TAKEN` | Yes | `intent=create` to a room that already exists (the client retries with a new code) |
| `ROOM_FULL` | Yes | A third `playerId` joins during the lobby |
| `GAME_IN_PROGRESS` | Yes | A third `playerId` joins while a match is running |
| `REPLACED_BY_NEW_TAB` | Yes | The same `playerId` connected again; the older connection is closed |
| `NOT_YOUR_TURN` | No | The intent came from the seat that is not `currentSeat` |
| `STALE_ACTION` | No | The `turnId` does not match (duplicate click, late click after a timeout) |
| `INVALID_PHASE` | No | The intent is not allowed in the current phase or step |
| `INVALID_MESSAGE` | No | Malformed JSON, unknown `type`, or wrong field types |

A connection with missing or invalid connect parameters (no `playerId`, unknown `intent`) is closed with `INVALID_MESSAGE` and counts as fatal in that one case. This is noted in the spec.

**DEC-4. Timing constants (G4).** All in milliseconds:

| Constant | Proposed value | Reason |
|---|---|---|
| `STEP_MS` | 10 000 | Rule 1.2.3 |
| `COUNTDOWN_MS` | 3 000 | "3-2-1" in section 5 |
| `POWER_RESOLVE_MS` | 2 000 | The original's 2-second Power Dice reveal |
| `CANNON_RESOLVE_MS` | 2 500 | About 1.5 s dice roll plus about 1 s tower crumble. On a KO, the match moves to `finished` when this window ends, so both players see the final hit before the result |

The client's animations must fit inside these windows. If the client track finds a window too short, it raises a blocker instead of changing the constant (rule 9.2.1).

**DEC-5. Small protocol details.**
- **Nicknames:** trimmed, internal whitespace collapsed, cut to **12 characters** (`NAME_MAX_LENGTH`). If empty, the server uses `Player 1` or `Player 2` based on the seat. Names are sanitised, never rejected. **Both sides enforce the limit:** the client's nickname input does not accept more than `NAME_MAX_LENGTH` characters (built in `build-game-client`), and the server still sanitises every name because a modified client can skip the input limit. Characters are counted as user-perceived characters, so an emoji counts as one.
- **Ready is one-way** in the lobby: a player cannot un-ready. Both ready flags reset when a seat is emptied or a match ends.
- **First seat in match 1** is `hostSeat` (the creator, D7). If the host left the lobby earlier, the new host goes first.
- **`turnId` format:** `m{match}-r{round}-s{seat}-{step}`, for example `m2-r3-s1-power`. The client treats it as an opaque string.

**DEC-6. Contract tests and stubs.**
- A new folder, **`tests/contracts/`**, owned by this change. It holds the `protocol.ts` tests and the fixture invariant tests (for example: HP between 0 and 50, `players` seats match `match.currentSeat`, `result` is set only in `finished`). It becomes read-only during the parallel phase, like `shared/types.ts`.
- Stub bodies in `rules.ts` and `rng.ts` throw `NotImplementedError("…")`. `build-game-server` may only replace the bodies; changing a signature is a blocker.

## Scope

### In Scope
- `shared/types.ts`, `shared/constants.ts`, `shared/protocol.ts` (implemented and tested), `shared/rules.ts` and `shared/rng.ts` (signatures only), `shared/fixtures/**`, `tests/contracts/**`
- New spec `openspec/specs/realtime-sync.md`
- Update `docs/DESIGN.md` sections 2.1, 2.2, 4 and 9.1 to match the confirmed decisions, and `openspec/project.md` (folder list, `tests/contracts/` ownership)

### Out of Scope
- Implementing the rules, RNG, room server, timers or lifecycle (`build-game-server`)
- Any React code, including the client's mock room connection and `useRoom` hook interface (`build-game-client`; the hook interface is internal to the client)
- Next-iteration items: grace period and forfeit (a `forfeit` reason is **not** added now), persistence, spectators

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | No | None in the MVP |
| API (protocol) | Yes | Defines all client and server messages; adds `welcome` and `INVALID_MESSAGE`; removes the separate `event` message (if DEC-1a and DEC-2a) |
| State | Yes | `RoomState` and related types become frozen code |
| UI | No | Fixtures only; no components |
| Tests | Yes | New `tests/contracts/`; existing smoke tests are unchanged |
| Dependencies | No | Uses only TypeScript and Vitest from `scaffold-project` |

## Architecture Considerations

- `shared/` is compiled in both the browser and the Workers context (set up in `scaffold-project`), so it must use only standard APIs. `crypto.getRandomValues` exists in both.
- Rules are pure: `(match, rng) → { match, event }`. They work on `MatchState`, not the whole `RoomState`, so they know nothing about connections, names or timers. The server owns `version`, `serverNow`, `turnDeadline` and `eventId`.
- Messages are discriminated unions on `type`, so `switch (msg.type)` is checked for completeness by TypeScript on both sides.
- `parseClientMessage` is the single entry point for untrusted input on the server. It returns a typed message or `null` and never throws.

## Success Criteria

- [ ] Both parallel tracks can start from `main` with no open questions about the protocol or state shape
- [ ] `npm run typecheck` passes in both the browser and the server TypeScript projects with the new `shared/` files
- [ ] Every phase and step has at least one fixture, and every fixture passes the invariant tests
- [ ] `parseClientMessage` rejects every malformed input in its test table without throwing
- [ ] `realtime-sync.md` lists the obligations of server and client and is archived to `openspec/specs/`
- [ ] All five quality gates pass

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A missing field is found during the parallel phase | Med | Med | Fixtures for every phase force each field to be filled in now; the blocker process (rule 9.2.1) handles anything left |
| The resolve windows feel wrong in play | Med | Low | The values are constants; `integrate-and-verify` may tune them on `main` |
| Stubs make the server track's tests confusing | Low | Low | `NotImplementedError` names the function and the owning change |
| `Intl.Segmenter` (counting an emoji as one character) is missing in PartyKit's bundled server runtime or in the TypeScript `lib` setting | Low | Low | Checked first in Phase 2 by running `sanitizeName` inside `partykit dev`. If missing, fall back to counting Unicode code points (`Array.from`) and report the difference before continuing |
| The fixture invariants are too strict for valid states | Low | Low | Invariants come from the rules and state machine only; any change goes through the coordinator |
