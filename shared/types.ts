/**
 * Shared types for room state and the client/server protocol.
 *
 * Frozen contract (define-game-contracts): read-only for both tracks during the parallel
 * build phase. Spec: `openspec/specs/realtime-sync.md`.
 *
 * Conventions: times are epoch milliseconds on the server clock; every field is set by the
 * server only. Clients render these values and never compute outcomes.
 */
import type {
  ERROR_CODES,
  INTENTS,
  PHASES,
  POWERS,
  RESULT_REASONS,
  SEATS,
  STEPS,
} from "./constants.ts";

export type Seat = (typeof SEATS)[number];
export type Phase = (typeof PHASES)[number];
/** `resolving`: a roll was accepted and both clients are animating; intents are rejected. */
export type Step = (typeof STEPS)[number];
export type Power = (typeof POWERS)[number];
export type Intent = (typeof INTENTS)[number];
export type ResultReason = (typeof RESULT_REASONS)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

export interface TowerState {
  /** 0..MAX_HP. */
  hp: number;
  /** The next hit this tower takes is halved (rounded up), then Shield is consumed. */
  shield: boolean;
  /** This seat's next attack bounces back onto its own tower (Ricochet placed by the opponent). */
  reflectNextAttack: boolean;
}

export interface PlayerInfo {
  /** Sanitised by the server (`sanitizeName`). */
  name: string;
  /** False while the player's connection is down; the seat is still held. */
  connected: boolean;
  /** Lobby only; one-way (DEC-5). All flags reset when a seat empties or a match ends. */
  ready: boolean;
}

/**
 * One match. Rule functions in `rules.ts` read and return this; they never touch
 * `turnDeadline` (the server sets it after each transition).
 */
export interface MatchState {
  /** 1, 2, 3… (rematches). */
  number: number;
  /** Acts first in every round; `hostSeat` in match 1, then alternates on each rematch (D7). */
  firstSeat: Seat;
  /** 1..ROUNDS. */
  round: number;
  currentSeat: Seat;
  step: Step;
  /** `makeTurnId(number, round, currentSeat, step)`. Opaque to the client; echoed in roll intents. */
  turnId: string;
  /** Epoch ms when the current step times out. Set by the server, not by rule functions. */
  turnDeadline: number;
  towers: Record<Seat, TowerState>;
  /** Seeds the cosmetic dice faces of both towers so both screens look the same. */
  towerSeed: number;
}

export interface MatchResult {
  winner: Seat | "tie";
  reason: ResultReason;
}

/** Full snapshot broadcast to every connection in the room. Contains no `playerId`. */
export interface RoomState {
  code: string;
  phase: Phase;
  /** Moves to the remaining player if the host leaves the lobby. */
  hostSeat: Seat;
  /** A missing seat is empty. */
  players: Partial<Record<Seat, PlayerInfo>>;
  /** `null` only in `lobby`. In `countdown` it holds the match that is about to start. */
  match: MatchState | null;
  /** Epoch ms when the countdown ends; non-null only in `countdown`. */
  countdownEndsAt: number | null;
  /** The animation trigger (DEC-2a). Clients animate when `eventId` is higher than the last one played. */
  lastEvent: GameEvent | null;
  /** Non-null only in `finished`. */
  result: MatchResult | null;
  /** Seats that pressed Rematch; non-empty only in `finished`. */
  rematchVotes: Seat[];
  /** Increments on every change. Clients ignore snapshots that are not newer. */
  version: number;
  /** Server clock at send time, for the client's clock-offset estimate. */
  serverNow: number;
}

// ---------------------------------------------------------------------------
// Events (carried in RoomState.lastEvent)
// ---------------------------------------------------------------------------

export interface CannonEvent {
  eventId: number;
  type: "cannon";
  actor: Seat;
  /** The two cannon dice, each 1..DIE_FACES. */
  dice: [number, number];
  /** dice[0] × dice[1]. */
  rawDamage: number;
  /** The tower that was hit: the actor's own tower if `reflected`. */
  target: Seat;
  reflected: boolean;
  shielded: boolean;
  /** Damage applied after Shield: ceil(rawDamage / 2) if `shielded`, else `rawDamage`. */
  damage: number;
}

export interface PowerEvent {
  eventId: number;
  type: "power";
  actor: Seat;
  power: Power;
  /** Set only for `heal`: the rolled amount (HEAL_MIN..HEAL_MAX) before the MAX_HP cap. */
  healAmount?: number;
  /** True when the server rolled because the Power step timed out (D13). */
  auto: boolean;
}

/** The Cannon step timed out; no attack. There is no resolving window after a skip. */
export interface TurnSkippedEvent {
  eventId: number;
  type: "turnSkipped";
  actor: Seat;
}

export type GameEvent = CannonEvent | PowerEvent | TurnSkippedEvent;

/** An event as produced by a rule function; the server adds `eventId`. */
export type GameEventBody =
  Omit<CannonEvent, "eventId"> | Omit<PowerEvent, "eventId"> | Omit<TurnSkippedEvent, "eventId">;

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

/** Read once from the connection URL query: `?playerId=…&name=…&intent=create|join`. */
export interface ConnectParams {
  playerId: string;
  /** Raw, unsanitised; the server sanitises it once the seat is known. */
  name: string;
  intent: Intent;
}

/** Client → server. Intents only; never outcomes. Extra fields are ignored. */
export type ClientMessage =
  | { type: "ready" }
  | { type: "rollPower"; turnId: string }
  | { type: "rollCannon"; turnId: string }
  | { type: "rematch" }
  | { type: "leave" };

/** Server → client. */
export type ServerMessage =
  /** Private to one connection, sent after every successful connect or reconnect (DEC-1a). */
  | { type: "welcome"; seat: Seat; code: string }
  | { type: "state"; state: RoomState }
  /** `message` is for logs; clients show their own text per `code`. */
  | { type: "error"; code: ErrorCode; message: string };

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** A uniform random number in [0, 1). */
export type RandomSource = () => number;

/** Injected into rule functions so rules stay pure and tests can be deterministic. */
export interface Rng {
  /** 1..DIE_FACES, uniform. */
  rollDie(): number;
  /** One of POWERS, uniform. */
  pickPower(): Power;
  /** max(ceil(rand × HEAL_MAX), HEAL_MIN): HEAL_MIN 50% of the time (D12). */
  healAmount(): number;
}
