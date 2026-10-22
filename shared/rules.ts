/**
 * Pure game rules (docs/DESIGN.md section 1). No I/O, timers or randomness inside; randomness is
 * injected through `Rng`. Rule functions never set `turnDeadline` or `eventId`: the server does.
 *
 * Contract (define-game-contracts): signatures are frozen. `build-game-server` replaces the
 * bodies; changing a signature is a blocker (DEC-6).
 *
 * Server flow per turn:
 *   power step:  applyPower → (POWER_RESOLVE_MS) → advanceTurn(match, "power")
 *   cannon step: applyCannon → (CANNON_RESOLVE_MS) → checkResult(match, "cannon") → advanceTurn(match, "cannon")
 *   timeouts:    Power step → applyPower(…, { auto: true }); Cannon step → skipTurn → checkResult → advanceTurn
 */
import { NotImplementedError } from "./errors.ts";
import type {
  CannonEvent,
  GameEventBody,
  MatchResult,
  MatchState,
  PowerEvent,
  Rng,
  Seat,
  TurnSkippedEvent,
} from "./types.ts";

/** Which step just finished, for `checkResult` and `advanceTurn`. A skipped turn counts as "cannon". */
export type CompletedStep = "power" | "cannon";

export interface RuleResult<E extends GameEventBody> {
  match: MatchState;
  event: E;
}

/**
 * Creates match `number`: both towers at MAX_HP with no statuses, round 1, `firstSeat` to act,
 * step `power` if round 1 is a power round else `cannon`, and the matching `turnId`.
 * `turnDeadline` is 0 until the server sets it.
 */
export function startMatch(input: {
  number: number;
  firstSeat: Seat;
  towerSeed: number;
}): MatchState {
  void input;
  throw new NotImplementedError("startMatch");
}

/**
 * Power step (rule 1.3): picks a power with `rng.pickPower()` and applies it to the current seat.
 * Shield: own tower gets `shield`. Ricochet: opponent gets `reflectNextAttack`. Heal: own HP +
 * `rng.healAmount()`, capped at MAX_HP. Swap: the two HP values swap; statuses stay.
 * Returns step `resolving` with a new `turnId`. Precondition: step is `power`.
 */
export function applyPower(
  match: MatchState,
  rng: Rng,
  options: { auto: boolean },
): RuleResult<Omit<PowerEvent, "eventId">> {
  void match;
  void rng;
  void options;
  throw new NotImplementedError("applyPower");
}

/**
 * Cannon step (rule 1.4): rolls two dice, rawDamage = A × B. Target is the opponent, or the
 * actor's own tower if the actor has `reflectNextAttack` (consumed). If the target has `shield`,
 * damage = ceil(rawDamage / 2) and Shield is consumed. HP = max(HP − damage, 0).
 * Returns step `resolving` with a new `turnId`. Precondition: step is `cannon`.
 */
export function applyCannon(match: MatchState, rng: Rng): RuleResult<Omit<CannonEvent, "eventId">> {
  void match;
  void rng;
  throw new NotImplementedError("applyCannon");
}

/**
 * Cannon step timed out (rule 1.2.3): no attack; Ricochet on the actor stays. The server then
 * calls `checkResult(match, "cannon")` and `advanceTurn(match, "cannon")` straight away (no
 * resolving window). Precondition: step is `cannon`.
 */
export function skipTurn(match: MatchState): RuleResult<Omit<TurnSkippedEvent, "eventId">> {
  void match;
  throw new NotImplementedError("skipTurn");
}

/**
 * Returns the result if the match is over, else `null` (rule 1.5): a tower at 0 HP → its owner
 * loses (reason `ko`); after the second player's cannon step in round ROUNDS → higher HP wins,
 * equal HP is a tie (reason `rounds`). `left` is decided by the server, not here.
 */
export function checkResult(match: MatchState, completed: CompletedStep): MatchResult | null {
  void match;
  void completed;
  throw new NotImplementedError("checkResult");
}

/**
 * Moves to the next step after a resolving window (or a skip): after "power" → the same seat's
 * `cannon` step; after "cannon" → the opponent's turn, or the next round (starting with
 * `firstSeat`, and with the `power` step in POWER_ROUNDS). Sets the new `turnId`.
 * Precondition: `checkResult` returned `null`.
 */
export function advanceTurn(match: MatchState, completed: CompletedStep): MatchState {
  void match;
  void completed;
  throw new NotImplementedError("advanceTurn");
}
