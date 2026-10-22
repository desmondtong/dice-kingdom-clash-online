/**
 * Sample room states and server messages for every phase and step.
 *
 * Frozen contract (define-game-contracts). Used by the client track as mock data and by both
 * tracks' tests. Every fixture passes the invariants in `tests/contracts/fixtures.test.ts`.
 * Seat 1 ("Desmond") created the room; times are relative to FIXTURE_NOW.
 */
import { MAX_HP, STEP_MS } from "../constants.ts";
import { makeTurnId } from "../protocol.ts";
import type {
  ErrorCode,
  GameEvent,
  MatchState,
  PlayerInfo,
  RoomState,
  Seat,
  ServerMessage,
  Step,
  TowerState,
} from "../types.ts";

/** Fixed server clock for all fixtures (2027-01-15T08:00:00Z). */
export const FIXTURE_NOW = 1_800_000_000_000;
export const FIXTURE_CODE = "KX7P";

// ---------------------------------------------------------------------------
// Builders (local to fixtures)
// ---------------------------------------------------------------------------

function tower(hp = MAX_HP, status: Partial<Omit<TowerState, "hp">> = {}): TowerState {
  return { hp, shield: false, reflectNextAttack: false, ...status };
}

function player(name: string, status: Partial<Omit<PlayerInfo, "name">> = {}): PlayerInfo {
  return { name, connected: true, ready: false, ...status };
}

const desmond = (status: Partial<Omit<PlayerInfo, "name">> = {}) => player("Desmond", status);
const alex = (status: Partial<Omit<PlayerInfo, "name">> = {}) => player("Alex", status);

function match(fields: {
  number?: number;
  firstSeat?: Seat;
  round: number;
  currentSeat: Seat;
  step: Step;
  towers?: Record<Seat, TowerState>;
  /** Milliseconds left in the current step. */
  msLeft?: number;
}): MatchState {
  const number = fields.number ?? 1;
  return {
    number,
    firstSeat: fields.firstSeat ?? 1,
    round: fields.round,
    currentSeat: fields.currentSeat,
    step: fields.step,
    turnId: makeTurnId(number, fields.round, fields.currentSeat, fields.step),
    turnDeadline: FIXTURE_NOW + (fields.msLeft ?? 7_000),
    towers: fields.towers ?? { 1: tower(), 2: tower() },
    towerSeed: 424_242,
  };
}

function room(fields: Partial<RoomState> & Pick<RoomState, "phase" | "version">): RoomState {
  return {
    code: FIXTURE_CODE,
    hostSeat: 1,
    players: {},
    match: null,
    countdownEndsAt: null,
    lastEvent: null,
    result: null,
    rematchVotes: [],
    serverNow: FIXTURE_NOW,
    ...fields,
  };
}

const bothReady = { 1: desmond({ ready: true }), 2: alex({ ready: true }) };
const bothNotReady = { 1: desmond(), 2: alex() };

// ---------------------------------------------------------------------------
// Lobby and countdown
// ---------------------------------------------------------------------------

/** The host is alone and waiting for an opponent. */
export const lobbyWaiting = room({ phase: "lobby", version: 1, players: { 1: desmond() } });

/** Both joined; the host is ready, the guest is not yet. */
export const lobbyBothJoined = room({
  phase: "lobby",
  version: 3,
  players: { 1: desmond({ ready: true }), 2: alex() },
});

/** The guest's connection dropped in the lobby; the seat is held. */
export const lobbyOpponentDisconnected = room({
  phase: "lobby",
  version: 4,
  players: { 1: desmond(), 2: alex({ connected: false }) },
});

/** Both ready: 3-2-1 before match 1. The match exists but no turn timer runs yet. */
export const countdown = room({
  phase: "countdown",
  version: 5,
  players: bothReady,
  match: match({ round: 1, currentSeat: 1, step: "cannon", msLeft: STEP_MS }),
  countdownEndsAt: FIXTURE_NOW + 2_000,
});

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

const cannonByAlexRound2: GameEvent = {
  eventId: 4,
  type: "cannon",
  actor: 2,
  dice: [3, 4],
  rawDamage: 12,
  target: 1,
  reflected: false,
  shielded: false,
  damage: 12,
};

/** Round 1, seat 1 to fire. */
export const playingCannonStep = room({
  phase: "playing",
  version: 6,
  players: bothReady,
  match: match({ round: 1, currentSeat: 1, step: "cannon" }),
});

/** Round 3 starts with the Power step for seat 1. */
export const playingPowerStep = room({
  phase: "playing",
  version: 14,
  players: bothReady,
  match: match({
    round: 3,
    currentSeat: 1,
    step: "power",
    towers: { 1: tower(38), 2: tower(29) },
  }),
  lastEvent: cannonByAlexRound2,
});

/** Seat 1 rolled Heal (+15) in round 3; both clients show the reveal. */
export const resolvingPower = room({
  phase: "playing",
  version: 15,
  players: bothReady,
  match: match({
    round: 3,
    currentSeat: 1,
    step: "resolving",
    towers: { 1: tower(50), 2: tower(29) },
  }),
  lastEvent: { eventId: 5, type: "power", actor: 1, power: "heal", healAmount: 15, auto: false },
});

/** Seat 2 timed out on the Power step in round 3; the server auto-rolled Swap. */
export const resolvingPowerAuto = room({
  phase: "playing",
  version: 19,
  players: bothReady,
  match: match({
    round: 3,
    currentSeat: 2,
    step: "resolving",
    towers: { 1: tower(22), 2: tower(41) },
  }),
  lastEvent: { eventId: 7, type: "power", actor: 2, power: "swap", auto: true },
});

/**
 * Seat 1 fired under Ricochet onto its own Shielded tower: 4 × 5 = 20, halved to 10.
 * Both statuses are now consumed.
 */
export const resolvingCannon = room({
  phase: "playing",
  version: 27,
  players: bothReady,
  match: match({
    round: 4,
    currentSeat: 1,
    step: "resolving",
    towers: { 1: tower(25), 2: tower(33) },
  }),
  lastEvent: {
    eventId: 10,
    type: "cannon",
    actor: 1,
    dice: [4, 5],
    rawDamage: 20,
    target: 1,
    reflected: true,
    shielded: true,
    damage: 10,
  },
});

/** Round 3 cannon step after seat 1 rolled Shield: Shield is active on seat 1. */
export const playingWithStatuses = room({
  phase: "playing",
  version: 17,
  players: bothReady,
  match: match({
    round: 3,
    currentSeat: 1,
    step: "cannon",
    towers: { 1: tower(38, { shield: true }), 2: tower(29) },
  }),
  lastEvent: { eventId: 5, type: "power", actor: 1, power: "shield", auto: false },
});

/**
 * Round 6: seat 2 rolled Ricochet (seat 1's next attack will bounce back), then lost its
 * connection during its own Cannon step. The timer keeps running.
 */
export const playingOpponentDisconnected = room({
  phase: "playing",
  version: 44,
  players: { 1: desmond({ ready: true }), 2: alex({ ready: true, connected: false }) },
  match: match({
    round: 6,
    currentSeat: 2,
    step: "cannon",
    msLeft: 4_000,
    towers: { 1: tower(19, { reflectNextAttack: true }), 2: tower(24) },
  }),
  lastEvent: { eventId: 17, type: "power", actor: 2, power: "ricochet", auto: false },
});

/** Seat 1 let the Cannon step time out in round 2; it is now seat 2's turn (no resolving window). */
export const playingAfterTurnSkipped = room({
  phase: "playing",
  version: 10,
  players: bothReady,
  match: match({
    round: 2,
    currentSeat: 2,
    step: "cannon",
    msLeft: STEP_MS,
    towers: { 1: tower(38), 2: tower(41) },
  }),
  lastEvent: { eventId: 3, type: "turnSkipped", actor: 1 },
});

// ---------------------------------------------------------------------------
// Finished
// ---------------------------------------------------------------------------

/** Seat 1 knocked out seat 2 in round 5. */
export const finishedKo = room({
  phase: "finished",
  version: 36,
  players: bothNotReady,
  match: match({
    round: 5,
    currentSeat: 1,
    step: "resolving",
    towers: { 1: tower(17), 2: tower(0) },
  }),
  lastEvent: {
    eventId: 13,
    type: "cannon",
    actor: 1,
    dice: [6, 5],
    rawDamage: 30,
    target: 2,
    reflected: false,
    shielded: false,
    damage: 30,
  },
  result: { winner: 1, reason: "ko" },
});

/** All 8 rounds played; seat 1 has more HP. */
export const finishedRoundsWin = room({
  phase: "finished",
  version: 61,
  players: bothNotReady,
  match: match({
    round: 8,
    currentSeat: 2,
    step: "resolving",
    towers: { 1: tower(22), 2: tower(15) },
  }),
  lastEvent: {
    eventId: 22,
    type: "cannon",
    actor: 2,
    dice: [1, 3],
    rawDamage: 3,
    target: 1,
    reflected: false,
    shielded: false,
    damage: 3,
  },
  result: { winner: 1, reason: "rounds" },
});

/** All 8 rounds played with equal HP; the last attack was halved by Shield. */
export const finishedTie = room({
  phase: "finished",
  version: 58,
  players: bothNotReady,
  match: match({
    round: 8,
    currentSeat: 2,
    step: "resolving",
    towers: { 1: tower(18), 2: tower(18) },
  }),
  lastEvent: {
    eventId: 21,
    type: "cannon",
    actor: 2,
    dice: [5, 5],
    rawDamage: 25,
    target: 1,
    reflected: false,
    shielded: true,
    damage: 13,
  },
  result: { winner: "tie", reason: "rounds" },
});

/** Seat 2 pressed Leave during round 4; seat 1 wins and is alone in the room. */
export const finishedLeft = room({
  phase: "finished",
  version: 30,
  players: { 1: desmond() },
  match: match({
    round: 4,
    currentSeat: 2,
    step: "cannon",
    towers: { 1: tower(25), 2: tower(33) },
  }),
  lastEvent: cannonByAlexRound2,
  result: { winner: 1, reason: "left" },
});

/** Match 2 (seat 2 went first) ended by KO; seat 2 has already voted for a rematch. */
export const finishedRematchVoted = room({
  phase: "finished",
  version: 92,
  players: bothNotReady,
  match: match({
    number: 2,
    firstSeat: 2,
    round: 6,
    currentSeat: 2,
    step: "resolving",
    towers: { 1: tower(0), 2: tower(8) },
  }),
  lastEvent: {
    eventId: 40,
    type: "cannon",
    actor: 2,
    dice: [6, 6],
    rawDamage: 36,
    target: 1,
    reflected: false,
    shielded: false,
    damage: 36,
  },
  result: { winner: 2, reason: "ko" },
  rematchVotes: [2],
});

/** All room-state fixtures by name. */
export const fixtures = {
  lobbyWaiting,
  lobbyBothJoined,
  lobbyOpponentDisconnected,
  countdown,
  playingCannonStep,
  playingPowerStep,
  resolvingPower,
  resolvingPowerAuto,
  resolvingCannon,
  playingWithStatuses,
  playingOpponentDisconnected,
  playingAfterTurnSkipped,
  finishedKo,
  finishedRoundsWin,
  finishedTie,
  finishedLeft,
  finishedRematchVoted,
} satisfies Record<string, RoomState>;

export type FixtureName = keyof typeof fixtures;

// ---------------------------------------------------------------------------
// Server messages
// ---------------------------------------------------------------------------

/** The private `welcome` each seat receives on connect or reconnect. */
export const sampleWelcome = {
  1: { type: "welcome", seat: 1, code: FIXTURE_CODE },
  2: { type: "welcome", seat: 2, code: FIXTURE_CODE },
} satisfies Record<Seat, ServerMessage>;

/** One sample `error` message per error code. */
export const sampleErrors = {
  ROOM_NOT_FOUND: { type: "error", code: "ROOM_NOT_FOUND", message: "Room KX7P does not exist" },
  CODE_TAKEN: { type: "error", code: "CODE_TAKEN", message: "Room KX7P already exists" },
  ROOM_FULL: { type: "error", code: "ROOM_FULL", message: "Room KX7P already has two players" },
  GAME_IN_PROGRESS: {
    type: "error",
    code: "GAME_IN_PROGRESS",
    message: "A match is in progress in room KX7P",
  },
  REPLACED_BY_NEW_TAB: {
    type: "error",
    code: "REPLACED_BY_NEW_TAB",
    message: "This seat was taken over by a newer connection",
  },
  NOT_YOUR_TURN: { type: "error", code: "NOT_YOUR_TURN", message: "It is seat 2's turn" },
  STALE_ACTION: {
    type: "error",
    code: "STALE_ACTION",
    message: "turnId m1-r1-s1-cannon is no longer current",
  },
  INVALID_PHASE: {
    type: "error",
    code: "INVALID_PHASE",
    message: "rollPower is not allowed in step cannon",
  },
  INVALID_MESSAGE: { type: "error", code: "INVALID_MESSAGE", message: "Unknown message type" },
} satisfies Record<ErrorCode, ServerMessage & { type: "error" }>;
