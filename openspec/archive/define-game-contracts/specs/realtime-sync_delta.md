# Delta: Realtime Sync

**Change ID:** `define-game-contracts`
**Affects:** client/server protocol, room state shape, error handling, timing
**Target spec:** `openspec/specs/realtime-sync.md` (new)

Based on the confirmed decisions DEC-1a (private `welcome`) and DEC-2a (events inside the snapshot).

---

## ADDED

### Requirement: Server authority

The room server owns all game state, all randomness and all timers. Clients send intents only.

#### Scenario: Client cannot choose an outcome
- GIVEN a match in progress
- WHEN a client sends a message containing dice values, damage, HP or a power choice
- THEN `parseClientMessage` strips those fields (or the message is rejected as `INVALID_MESSAGE` if the type is unknown)
- AND the outcome is computed only from the server's random number generator

### Requirement: Identity comes from the connection

A player's identity and intent are read once from the connection's query parameters, never from game messages.

#### Scenario: Connect parameters
- GIVEN a client connects with `?playerId=…&name=…&intent=create|join`
- WHEN the parameters are valid
- THEN the server binds that connection to a seat
- AND later messages on that connection act only for that seat

#### Scenario: Invalid connect parameters
- GIVEN a client connects without a `playerId`, with a `playerId` that does not match `PLAYER_ID_PATTERN` (8 to 64 characters of `A-Z a-z 0-9 _ -`), or with an unknown `intent`
- THEN the server sends `error` with `INVALID_MESSAGE` and closes the connection

### Requirement: Nickname limit on both sides

Nicknames are at most `NAME_MAX_LENGTH` (12) characters. The client limits input; the server enforces the limit regardless.

#### Scenario: Client input limit
- GIVEN the nickname input on the Home page
- WHEN the player types or pastes more than 12 characters
- THEN the input keeps only the first 12 characters

#### Scenario: Server sanitises every name
- GIVEN a connection whose `name` parameter is longer than 12 characters, has extra spaces, or is empty
- THEN the server trims it, collapses internal spaces and cuts it to 12 characters
- AND an empty result becomes `Player 1` or `Player 2` for that seat
- AND an emoji counts as one character in both checks

### Requirement: Private seat assignment

Each connection learns its own seat privately, and no player's `playerId` is ever broadcast.

#### Scenario: Welcome on connect
- GIVEN a connection is accepted into seat 1 or 2 (new or reconnected)
- THEN the server sends that connection only `{ type: "welcome", seat, code }`
- AND then sends the current `state`

#### Scenario: playerId stays secret
- GIVEN any `state` message
- THEN it contains no `playerId` of any player

### Requirement: Intent validation

The server accepts an intent only if it is valid for the sender's seat and the current phase, step and turn.

#### Scenario: Wrong seat
- GIVEN it is seat 1's turn
- WHEN seat 2 sends `rollCannon`
- THEN the server replies `NOT_YOUR_TURN` and the state does not change

#### Scenario: Wrong phase or step
- GIVEN the step is `cannon`
- WHEN the active player sends `rollPower`
- THEN the server replies `INVALID_PHASE` and the state does not change

#### Scenario: Malformed message
- WHEN a client sends invalid JSON, a non-object, an unknown `type`, a field of the wrong type, a `turnId` longer than `TURN_ID_MAX_LENGTH` (64), or a message longer than `MAX_MESSAGE_LENGTH` (1024)
- THEN the server replies `INVALID_MESSAGE`, keeps the connection open and does not change the state

### Requirement: Duplicate and stale actions

Each intent for a turn step is accepted at most once.

#### Scenario: Double click
- GIVEN the active player sends `rollCannon` with the current `turnId` twice
- THEN the first is accepted and the step becomes `resolving` with a new `turnId`
- AND the second gets `STALE_ACTION`

#### Scenario: Late click after a timeout
- GIVEN the step timed out and the server moved on
- WHEN the old `turnId` arrives
- THEN the server replies `STALE_ACTION`

### Requirement: Versioned snapshots

Every state change produces a full snapshot with a higher version.

#### Scenario: Out-of-order snapshot
- GIVEN a client has rendered `version` N
- WHEN a snapshot with version N or lower arrives
- THEN the client ignores it

### Requirement: Events travel inside the snapshot

The animation trigger is `state.lastEvent`; there is no separate event message.

#### Scenario: Animate once
- GIVEN a client last animated `eventId` E
- WHEN a snapshot arrives with `lastEvent.eventId` greater than E
- THEN the client plays that event's animation and sound once and records the new `eventId`

#### Scenario: No replay after reconnect
- GIVEN a client reconnects and receives a snapshot whose `lastEvent` it has already played
- THEN it does not play the animation again

### Requirement: Shared timing

Both sides use the timing constants from `shared/constants.ts`.

#### Scenario: Turn timer display
- GIVEN a snapshot with `turnDeadline` and `serverNow`
- THEN the client shows the remaining time as `turnDeadline − (Date.now() + clockOffset)`, where `clockOffset` is estimated from `serverNow`
- AND only the server decides when a step times out

#### Scenario: Resolving windows
- GIVEN a roll is accepted
- THEN the server stays in step `resolving` for `POWER_RESOLVE_MS` or `CANNON_RESOLVE_MS` before advancing
- AND intents received during `resolving` get `INVALID_PHASE`

#### Scenario: Knockout timing
- GIVEN a cannon shot brings a tower to 0 HP
- THEN the match stays in `playing` with step `resolving` for `CANNON_RESOLVE_MS`
- AND then moves to `finished` with reason `ko`, so both players see the final hit before the result

#### Scenario: Skipped turn
- GIVEN the Cannon step times out
- THEN the server sets `lastEvent` to a `turnSkipped` event and moves straight to the next turn, with no resolving window

#### Scenario: Countdown
- GIVEN both players are ready
- THEN the phase becomes `countdown` with `countdownEndsAt` = now + `COUNTDOWN_MS` and the new match in `match`
- AND when the countdown ends, the phase becomes `playing` and the first step's timer starts

### Requirement: Error codes

The server reports problems with one of nine error codes. Fatal errors close the connection; the others do not.

#### Scenario: Fatal error
- WHEN the server sends `ROOM_NOT_FOUND`, `CODE_TAKEN`, `ROOM_FULL`, `GAME_IN_PROGRESS` or `REPLACED_BY_NEW_TAB`
- THEN it closes that connection
- AND the client does not reconnect automatically and shows a friendly message

#### Scenario: Non-fatal error
- WHEN the server sends `NOT_YOUR_TURN`, `STALE_ACTION`, `INVALID_PHASE` or `INVALID_MESSAGE`
- THEN the connection stays open and the state is unchanged
- AND the client keeps rendering the latest snapshot

### Requirement: Frozen contracts

`shared/types.ts`, `shared/constants.ts`, `shared/protocol.ts`, `shared/fixtures/**` and `tests/contracts/**` do not change during the parallel phase.

#### Scenario: A track needs a contract change
- GIVEN `build-game-server` or `build-game-client` is in progress
- WHEN it needs a change to a frozen file
- THEN it stops and reports a blocker, and the coordinator changes the file on `main`

#### Scenario: Fixtures cover the state machine
- GIVEN the fixtures in `shared/fixtures/`
- THEN every `Phase` and every `Step` value appears in at least one fixture
- AND every fixture passes the invariant tests in `tests/contracts/`

---

## MODIFIED

(None. This is a new spec.)

---

## REMOVED

(None)
