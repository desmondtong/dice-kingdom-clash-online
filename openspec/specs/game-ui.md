# Game UI Specification

**Status:** Active
**Introduced by:** `build-game-client` (archived 2026-10-22)
**Covers:** Home, How To Play, lobby, board, timers, animations and sound, music toggle, connection and errors, leaving and rematch, development mock
**Code:** `src/`, `tests/client/`

---

## Requirements

### Requirement: Getting into a room

#### Scenario: Create a room
- GIVEN the Home page with a nickname entered
- WHEN the player clicks Create Room
- THEN the client generates a 4-character code, connects with `intent=create` and opens `/room/{code}`
- AND on `CODE_TAKEN` it retries with a new code, up to 5 times

#### Scenario: Join with a code
- WHEN the player enters a code and clicks Join Room
- THEN the code is upper-cased and checked against the room code alphabet before connecting with `intent=join`

#### Scenario: Open an invite link
- GIVEN this tab has not joined room C
- WHEN the player opens `/room/C`
- THEN a "Join room C" card with the nickname input is shown before connecting

#### Scenario: Refresh
- GIVEN this tab has joined room C
- WHEN the page is refreshed
- THEN the client reconnects with the same `playerId` and `intent=join` without asking anything

### Requirement: Nickname input

#### Scenario: Limit while typing
- WHEN the player types or pastes into the nickname input
- THEN the value is cut with `limitNameInput` to 12 characters, an emoji counting as one

### Requirement: The UI is derived from state

#### Scenario: Correct screen
- GIVEN any `RoomState`
- THEN `lobby` shows the Lobby, `countdown` shows the board with the countdown overlay, `playing` shows the board, `finished` shows the board with the Result modal

#### Scenario: Buttons enabled only when allowed
- THEN Ready is enabled only in `lobby` with both seats filled and this player not ready
- AND the Power deck only on this player's turn in step `power`
- AND Roll only on this player's turn in step `cannon`
- AND Rematch only in `finished` with the opponent present and no vote from this player yet
- AND every action is disabled in `resolving`, while this player's connection is down, and after a click until a newer snapshot arrives

#### Scenario: Same board on both screens
- THEN seat 1 is always on the left and seat 2 on the right
- AND this player's side is marked "You"
- AND tower dice faces are seeded from `towerSeed`, seat and index, so both screens show the same faces

### Requirement: Timers

#### Scenario: Turn timer
- THEN the remaining time shown is `turnDeadline − (Date.now() + clockOffset)`, never below 0
- AND the client never ends a step itself

#### Scenario: Countdown
- GIVEN phase `countdown`
- THEN a 3-2-1 overlay counts down to `countdownEndsAt` with the same clock offset

### Requirement: Animations and sound

#### Scenario: Play each event once
- WHEN a snapshot brings a `lastEvent` with a new `eventId`
- THEN its animation and sound play once on both screens
- AND a repeated or reconnect snapshot with the same `eventId` plays nothing

#### Scenario: Animations fit the windows
- THEN a Power reveal finishes within `POWER_RESOLVE_MS` and a cannon roll plus tower crumble within `CANNON_RESOLVE_MS`
- AND the HP shown changes when the hit lands; prior authoritative towers are retained through unrelated snapshots until that cue, never reconstructed from damage
- AND the Power shuffle uses `POWER_RESOLVE_MS × 0.6`, the cannon impact uses `CANNON_RESOLVE_MS × 0.4`, and the hit sound shares that impact cue
- AND a direct resolving snapshot with no prior snapshot renders the supplied HP immediately

#### Scenario: Background music
- THEN BGM starts only after the player's first click and loops at volume 0.2
- AND while music is muted, the first click does not start it

### Requirement: Music toggle

Added after merge (commit `19fde85`) so that two tabs on one laptop do not play overlapping music.

#### Scenario: Mute and unmute the background music
- GIVEN any page
- WHEN the player clicks the **Music on / Music off** button in the top-right corner
- THEN only the background music pauses or resumes; sound effects keep playing
- AND the button shows its state (`aria-pressed`, "Mute music" / "Unmute music")

#### Scenario: Remembered and shared between tabs
- THEN the choice is stored in `localStorage` (`dkc.musicMuted`) and applied on the next load
- AND other tabs of the same browser follow the change immediately (`storage` event); a private window keeps its own setting

### Requirement: Connection and errors

#### Scenario: Own connection lost
- WHEN this player's connection drops
- THEN a "Connection lost, reconnecting…" banner is shown and actions are disabled until a new snapshot

#### Scenario: Opponent disconnected
- WHEN the opponent's `connected` is false
- THEN their connection dot turns off and "Opponent disconnected, reconnecting…" is shown

#### Scenario: Fatal error
- WHEN a fatal error arrives
- THEN the client stops reconnecting and shows a friendly message with Back to Home

#### Scenario: Non-fatal error
- WHEN a non-fatal error arrives
- THEN the client keeps the latest snapshot, re-enables the action if the state allows it, and shows a short message

### Requirement: Leaving and playing again

#### Scenario: Leave during a match
- WHEN the player clicks Leave in `playing`
- THEN a confirmation asks "Leave the match? Your opponent wins."
- AND on confirm the client sends `leave`, closes the socket without reconnecting, forgets the room and goes to Home

#### Scenario: Opponent left
- GIVEN `finished` with reason `left`
- THEN the Result shows "Opponent left, you win" with Back to Home only (D19)

#### Scenario: Rematch
- WHEN this player clicks Rematch
- THEN the button shows "Waiting for opponent" and the opponent sees this player's vote

### Requirement: No outcome logic on the client

#### Scenario: No client randomness for outcomes
- THEN `src/**` contains no `Math.random`, and no dice, damage, HP or result is computed on the client

### Requirement: Development without the server

#### Scenario: Mock mode in development only
- GIVEN a development build
- THEN `?mock=<fixtureName>&seat=1|2` renders that fixture, `?mock=demo` plays a scripted match, and `/dev/fixtures` lists every fixture
- AND none of these exist in a production build
- AND without `?mock=`, development and production builds both connect to the real room server (changed after merge, commit `b98b522`)
