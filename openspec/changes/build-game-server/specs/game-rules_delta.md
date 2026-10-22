# Delta: Game Rules

**Change ID:** `build-game-server`
**Affects:** `shared/rules.ts`, `shared/rng.ts`
**Target spec:** `openspec/specs/game-rules.md` (new)

Source: DESIGN.md 1 (canonical rules) and D5, D7, D12, D13.

---

## ADDED

### Requirement: Match setup

Each match starts with both towers at `MAX_HP` (50) with no statuses, round 1, and `firstSeat` to act.

#### Scenario: First seat
- GIVEN match 1 in a room whose host is seat 1
- THEN `firstSeat` is 1
- AND on each rematch `firstSeat` alternates

#### Scenario: Turn order
- GIVEN any round
- THEN `firstSeat` takes its turn first, then the other seat
- AND after the second seat's turn the round number increases

### Requirement: Power step

In rounds 3 and 6 each turn starts with the Power step. The power is picked uniformly from Shield, Ricochet, Heal and Swap and applied at once.

#### Scenario: Shield
- WHEN a player gets Shield
- THEN their tower has `shield = true` until it next takes damage

#### Scenario: Ricochet
- WHEN a player gets Ricochet
- THEN the opponent has `reflectNextAttack = true` until the opponent next fires

#### Scenario: Heal
- WHEN a player gets Heal
- THEN the amount is `max(ceil(rand × 20), 10)` (10 half the time, 11 to 20 at 5% each)
- AND the tower's HP increases by that amount, capped at 50

#### Scenario: Swap
- WHEN a player gets Swap
- THEN the two towers swap HP
- AND Shield and Ricochet stay with their original owners

#### Scenario: Power step timeout
- WHEN the Power step times out
- THEN the server rolls the Power Dice for the player (`auto: true`)

### Requirement: Cannon step

The active player's attack deals die A × die B damage (1 to 36), resolved in a fixed order.

#### Scenario: Resolution order
- GIVEN an attack
- THEN the target is the attacker's own tower if the attacker has `reflectNextAttack` (consumed), otherwise the opponent's tower
- AND if the target has `shield`, damage = ceil(damage / 2) and Shield is consumed
- AND the target's HP becomes max(HP − damage, 0)

#### Scenario: Cannon step timeout
- WHEN the Cannon step times out
- THEN the turn is skipped with no attack
- AND the player's `reflectNextAttack` stays

### Requirement: End of match

#### Scenario: Knockout
- WHEN any tower reaches 0 HP
- THEN the match ends with reason `ko` and that tower's owner loses
- AND this includes a player knocked out by their own reflected attack

#### Scenario: After round 8
- WHEN the second seat's Cannon step in round 8 is finished (fired or skipped) and no tower is at 0
- THEN the higher HP wins with reason `rounds`
- AND equal HP is a tie

### Requirement: Fair randomness

All dice, powers and heal amounts come from `crypto.getRandomValues` on the server; rules receive randomness only through `Rng`.

#### Scenario: Deterministic tests
- GIVEN a scripted `Rng`
- THEN the same inputs always produce the same match state and event

---

## MODIFIED

(None. This is a new spec.)

---

## REMOVED

(None)


## Implementation Notes (2026-10-22)

All frozen rule/RNG exports and signatures are unchanged. Rules return fresh match/tower objects, preserve server-owned deadlines, and emit event bodies without eventId; the room assigns deadlines and monotonically increasing event IDs. Seventeen RNG/rule tests cover mappings, immutability, canonical attack order, statuses, Heal cap, first-seat ordering, power rounds, KO and round-8 outcomes. All five automated gates passed after rebasing onto `c734a8d` (270 tests total).

A KO-producing Cannon event leaves a 0-HP tower in playing/resolving for the prescribed CANNON_RESOLVE_MS window before the room publishes finished. This is required by realtime-sync even though the static playing sample fixtures have positive HP. Owned snapshot tests allow 0 HP only during resolving, without changing frozen fixtures or contract tests.

The coordinator removed the obsolete frozen stub-throw check on main in `c734a8d`; the server track did not edit that test. Runtime smoke and idle-room measurement are explicitly coordinator-owned after merge and remain pending, as recorded in tasks.md. No merge or archive has been performed by this track.
