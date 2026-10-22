/**
 * Game and protocol constants shared by the room server and the client.
 *
 * Frozen contract (define-game-contracts): during the parallel build phase these values are
 * read-only for both tracks. Changes go through the coordinator on `main`.
 * All durations are in milliseconds.
 */

/** Both seats, in display order (seat 1 is shown on the left). */
export const SEATS = [1, 2] as const;

export const PHASES = ["lobby", "countdown", "playing", "finished"] as const;
export const STEPS = ["power", "cannon", "resolving"] as const;
export const POWERS = ["shield", "ricochet", "heal", "swap"] as const;
export const INTENTS = ["create", "join"] as const;
export const RESULT_REASONS = ["ko", "rounds", "left"] as const;

// ---------------------------------------------------------------------------
// Rules (docs/DESIGN.md section 1)
// ---------------------------------------------------------------------------

/** Starting and maximum tower HP. */
export const MAX_HP = 50;
/** Rounds per match; each player takes one turn per round. */
export const ROUNDS = 8;
/** Rounds in which a turn starts with the Power step. */
export const POWER_ROUNDS: readonly number[] = [3, 6];
/** Faces on a cannon die (values 1..DIE_FACES). */
export const DIE_FACES = 6;
/** Heal amount range (D12): max(ceil(rand × HEAL_MAX), HEAL_MIN). */
export const HEAL_MIN = 10;
export const HEAL_MAX = 20;

// ---------------------------------------------------------------------------
// Timing (DEC-4). Client animations must fit inside the resolve windows.
// ---------------------------------------------------------------------------

/** Time limit for the Power step and for the Cannon step. */
export const STEP_MS = 10_000;
/** Lobby → playing countdown ("3-2-1"). */
export const COUNTDOWN_MS = 3_000;
/** Resolving window after a Power Dice roll (reveal). */
export const POWER_RESOLVE_MS = 2_000;
/** Resolving window after a cannon shot (dice roll + tower crumble). On a KO, the match finishes when it ends. */
export const CANNON_RESOLVE_MS = 2_500;

// ---------------------------------------------------------------------------
// Rooms, identity and messages
// ---------------------------------------------------------------------------

/** Room codes are 4 characters long. */
export const ROOM_CODE_LENGTH = 4;
/** Room code alphabet without look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Maximum nickname length in user-perceived characters (an emoji counts as one). */
export const NAME_MAX_LENGTH = 12;
/** Allowed `playerId` format (the client uses `crypto.randomUUID()`). */
export const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** Maximum `turnId` length accepted in a client message. */
export const TURN_ID_MAX_LENGTH = 64;
/** Client messages longer than this (in UTF-16 code units) are rejected as INVALID_MESSAGE. */
export const MAX_MESSAGE_LENGTH = 1_024;

// ---------------------------------------------------------------------------
// Error codes (DEC-3)
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "CODE_TAKEN",
  "ROOM_FULL",
  "GAME_IN_PROGRESS",
  "REPLACED_BY_NEW_TAB",
  "NOT_YOUR_TURN",
  "STALE_ACTION",
  "INVALID_PHASE",
  "INVALID_MESSAGE",
] as const;

/**
 * Errors after which the server closes the connection and the client must not reconnect
 * automatically. `INVALID_MESSAGE` is fatal only for invalid connect parameters; see
 * `openspec/specs/realtime-sync.md`.
 */
export const FATAL_ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "CODE_TAKEN",
  "ROOM_FULL",
  "GAME_IN_PROGRESS",
  "REPLACED_BY_NEW_TAB",
] as const satisfies readonly (typeof ERROR_CODES)[number][];
