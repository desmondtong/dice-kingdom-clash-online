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
import { MAX_HP, POWER_ROUNDS, ROUNDS } from "./constants.ts";
import { makeTurnId, opponent } from "./protocol.ts";
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

function cloneMatch(match: MatchState): MatchState {
  return {
    ...match,
    towers: {
      1: { ...match.towers[1] },
      2: { ...match.towers[2] },
    },
  };
}

function withTurn(
  match: MatchState,
  round: number,
  currentSeat: Seat,
  step: MatchState["step"],
): MatchState {
  const next = cloneMatch(match);
  return {
    ...next,
    round,
    currentSeat,
    step,
    turnId: makeTurnId(next.number, round, currentSeat, step),
  };
}

function isPowerRound(round: number): boolean {
  return POWER_ROUNDS.includes(round);
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
  const round = 1;
  const step = isPowerRound(round) ? "power" : "cannon";

  return {
    number: input.number,
    firstSeat: input.firstSeat,
    round,
    currentSeat: input.firstSeat,
    step,
    turnId: makeTurnId(input.number, round, input.firstSeat, step),
    turnDeadline: 0,
    towers: {
      1: { hp: MAX_HP, shield: false, reflectNextAttack: false },
      2: { hp: MAX_HP, shield: false, reflectNextAttack: false },
    },
    towerSeed: input.towerSeed,
  };
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
  const actor = match.currentSeat;
  const power = rng.pickPower();
  const next = withTurn(match, match.round, actor, "resolving");
  const event: Omit<PowerEvent, "eventId"> = { type: "power", actor, power, auto: options.auto };

  switch (power) {
    case "shield":
      next.towers[actor].shield = true;
      break;
    case "ricochet":
      next.towers[opponent(actor)].reflectNextAttack = true;
      break;
    case "heal": {
      const healAmount = rng.healAmount();
      next.towers[actor].hp = Math.min(next.towers[actor].hp + healAmount, MAX_HP);
      event.healAmount = healAmount;
      break;
    }
    case "swap": {
      const otherSeat = opponent(actor);
      const actorHp = next.towers[actor].hp;
      next.towers[actor].hp = next.towers[otherSeat].hp;
      next.towers[otherSeat].hp = actorHp;
      break;
    }
  }

  return { match: next, event };
}

/**
 * Cannon step (rule 1.4): rolls two dice, rawDamage = A × B. Target is the opponent, or the
 * actor's own tower if the actor has `reflectNextAttack` (consumed). If the target has `shield`,
 * damage = ceil(rawDamage / 2) and Shield is consumed. HP = max(HP − damage, 0).
 * Returns step `resolving` with a new `turnId`. Precondition: step is `cannon`.
 */
export function applyCannon(match: MatchState, rng: Rng): RuleResult<Omit<CannonEvent, "eventId">> {
  const actor = match.currentSeat;
  const dice: [number, number] = [rng.rollDie(), rng.rollDie()];
  const rawDamage = dice[0] * dice[1];
  const next = withTurn(match, match.round, actor, "resolving");
  const reflected = next.towers[actor].reflectNextAttack;
  const target = reflected ? actor : opponent(actor);

  if (reflected) next.towers[actor].reflectNextAttack = false;

  const shielded = next.towers[target].shield;
  const damage = shielded ? Math.ceil(rawDamage / 2) : rawDamage;
  if (shielded) next.towers[target].shield = false;
  next.towers[target].hp = Math.max(next.towers[target].hp - damage, 0);

  return {
    match: next,
    event: { type: "cannon", actor, dice, rawDamage, target, reflected, shielded, damage },
  };
}

/**
 * Cannon step timed out (rule 1.2.3): no attack; Ricochet on the actor stays. The server then
 * calls `checkResult(match, "cannon")` and `advanceTurn(match, "cannon")` straight away (no
 * resolving window). Precondition: step is `cannon`.
 */
export function skipTurn(match: MatchState): RuleResult<Omit<TurnSkippedEvent, "eventId">> {
  return {
    match: cloneMatch(match),
    event: { type: "turnSkipped", actor: match.currentSeat },
  };
}

/**
 * Returns the result if the match is over, else `null` (rule 1.5): a tower at 0 HP → its owner
 * loses (reason `ko`); after the second player's cannon step in round ROUNDS → higher HP wins,
 * equal HP is a tie (reason `rounds`). `left` is decided by the server, not here.
 */
export function checkResult(match: MatchState, completed: CompletedStep): MatchResult | null {
  if (match.towers[1].hp === 0) return { winner: 2, reason: "ko" };
  if (match.towers[2].hp === 0) return { winner: 1, reason: "ko" };

  const finalSeat = opponent(match.firstSeat);
  if (completed !== "cannon" || match.round !== ROUNDS || match.currentSeat !== finalSeat) {
    return null;
  }

  const hp1 = match.towers[1].hp;
  const hp2 = match.towers[2].hp;
  return { winner: hp1 === hp2 ? "tie" : hp1 > hp2 ? 1 : 2, reason: "rounds" };
}

/**
 * Moves to the next step after a resolving window (or a skip): after "power" → the same seat's
 * `cannon` step; after "cannon" → the opponent's turn, or the next round (starting with
 * `firstSeat`, and with the `power` step in POWER_ROUNDS). Sets the new `turnId`.
 * Precondition: `checkResult` returned `null`.
 */
export function advanceTurn(match: MatchState, completed: CompletedStep): MatchState {
  if (completed === "power") {
    return withTurn(match, match.round, match.currentSeat, "cannon");
  }

  const nextSeat = opponent(match.currentSeat);
  if (match.currentSeat !== opponent(match.firstSeat)) {
    return withTurn(match, match.round, nextSeat, isPowerRound(match.round) ? "power" : "cannon");
  }

  const nextRound = match.round + 1;
  return withTurn(match, nextRound, match.firstSeat, isPowerRound(nextRound) ? "power" : "cannon");
}
