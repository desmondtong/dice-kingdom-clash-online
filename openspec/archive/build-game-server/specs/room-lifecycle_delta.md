# Delta: Room Lifecycle

**Change ID:** `build-game-server`
**Affects:** `party/**`
**Target spec:** `openspec/specs/room-lifecycle.md` (new)

Source: DESIGN.md 4 to 6, D14, D19, and the cross-track agreements X1 to X8 in `proposal.md`. Based on the confirmed options (a) for S-DEC-1 to S-DEC-7.

---

## ADDED

### Requirement: Creating and joining a room

#### Scenario: Create
- GIVEN no room exists with code C
- WHEN a player connects to C with `intent=create`
- THEN they get seat 1, become host, and receive `welcome` then `state` in `lobby`

#### Scenario: Code already used
- GIVEN room C exists
- WHEN a new `playerId` connects with `intent=create`
- THEN it gets `CODE_TAKEN` and the connection is closed

#### Scenario: Join
- GIVEN room C is in `lobby` with one free seat
- WHEN a new `playerId` connects with `intent=join`
- THEN they get the free seat and both players receive the new `state`

#### Scenario: Room not found
- WHEN a new `playerId` connects to a room that was never created with `intent=join`
- THEN it gets `ROOM_NOT_FOUND` and the connection is closed

#### Scenario: Room full or match running
- GIVEN room C has both seats taken in `lobby`, or is in `countdown`, `playing` or `finished`
- WHEN a new `playerId` connects
- THEN it gets `ROOM_FULL` (lobby) or `GAME_IN_PROGRESS` (other phases) and the connection is closed

### Requirement: Reconnect and second tab

#### Scenario: Refresh
- GIVEN a player holds a seat
- WHEN they connect again with the same `playerId` (any `intent`)
- THEN they get the same seat with their original name, `connected` becomes true, and they receive `welcome` then the current `state`
- AND the match continues from where it was

#### Scenario: Second tab
- GIVEN a seat's player is connected
- WHEN a second connection arrives with the same `playerId`
- THEN the new connection takes over the seat
- AND the old connection gets `REPLACED_BY_NEW_TAB` and is closed
- AND the old connection closing does not mark the seat disconnected

#### Scenario: Disconnect
- WHEN a seat's current connection closes without Leave
- THEN the seat is held with `connected = false`
- AND countdown and turn timers keep running (a disconnected player's steps time out)

### Requirement: Ready and countdown

#### Scenario: Both ready
- GIVEN both seats are filled in `lobby`
- WHEN both players have sent `ready`
- THEN the phase becomes `countdown` for `COUNTDOWN_MS`, then `playing` with the first step's timer started

#### Scenario: Ready is one-way
- WHEN a player sends `ready` again
- THEN nothing changes and no error is sent

#### Scenario: Ready alone
- GIVEN only one seat is filled
- WHEN that player sends `ready`
- THEN the server replies `INVALID_PHASE`

### Requirement: Leaving

#### Scenario: Leave in the lobby
- WHEN a player leaves in `lobby`
- THEN their seat is freed and all ready flags reset
- AND if the host left, the remaining player becomes host

#### Scenario: Leave during the countdown
- WHEN a player leaves in `countdown`
- THEN the countdown is cancelled and the room returns to `lobby` with the remaining player as host
- AND no result is recorded

#### Scenario: Leave during a match
- WHEN a player leaves in `playing`
- THEN the match ends at once with reason `left` and the remaining player wins
- AND the remaining player becomes host

#### Scenario: Leave after a match
- WHEN a player leaves in `finished`
- THEN their seat is freed and rematch votes are cleared
- AND the remaining player can only go Back to Home (D19); `rematch` gets `INVALID_PHASE`

#### Scenario: Last player leaves
- WHEN the last seat is freed by Leave
- THEN the room is discarded and its code can be created again

#### Scenario: Leaver's connection
- WHEN the server has processed `leave`
- THEN it broadcasts the new state to the others and closes the leaver's connection with code 1000

### Requirement: Turn timing

#### Scenario: Step deadline
- WHEN a step starts
- THEN `turnDeadline` = now + `STEP_MS`
- AND when it passes, the Power step auto-rolls and the Cannon step is skipped

#### Scenario: Timer and click race
- GIVEN the deadline timer and a valid click arrive at almost the same moment
- THEN whichever the server processes first wins
- AND the other gets `STALE_ACTION` (click) or does nothing (timer)

### Requirement: Rematch

#### Scenario: Both vote
- GIVEN `finished` with both players present
- WHEN both send `rematch`
- THEN the phase becomes `countdown` for match + 1 with `firstSeat` alternated
- AND rematch votes reset

#### Scenario: One vote
- WHEN only one player has voted
- THEN `rematchVotes` shows that seat to both players

---

## MODIFIED

(None. This is a new spec.)

---

## REMOVED

(None)


## Implementation Notes (2026-10-22)

The implemented controller is independent of PartyKit and injects transport, clock, scheduler, gameplay RNG and a separate cosmetic tower-seed source. Snapshot construction reads only public player information; private identity bindings never enter the serialized state. A fresh generation token accompanies each timer's turnId guard because Power and Cannon resolving windows in the same turn have equal frozen turnIds. Disconnect/reconnect state broadcasts do not reset or extend the active timer.

Stale tokens are rejected before checking the current seat/step so a duplicate or late click gets `STALE_ACTION` even after the timer advanced to another seat. An intent using the current token during resolving gets `INVALID_PHASE`. Active-step deadlines are now + STEP_MS; resolving deadlines are now + the appropriate animation duration; finished deadlines are 0. Ready flags in countdown/playing indicate both players consented to the new match, including after rematch; flags are false in finished.

Fifty controller tests and two adapter tests passed as part of the 270-test, five-gate post-rebase verification. **Real PartyKit smoke testing and idle-room retention measurement remain deferred to the coordinator after merge, by explicit instruction at 16:50 on 2026-10-22.** No runtime success or expiry duration is claimed here. No source-of-truth spec is archived or updated on this track.
