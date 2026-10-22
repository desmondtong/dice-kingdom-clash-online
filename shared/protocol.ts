/**
 * Protocol helpers shared by the room server and the client.
 *
 * Frozen contract (define-game-contracts), implemented and tested here because both sides need
 * exactly the same behaviour. All functions are pure and never throw on untrusted input.
 */
import {
  FATAL_ERROR_CODES,
  INTENTS,
  MAX_MESSAGE_LENGTH,
  NAME_MAX_LENGTH,
  PLAYER_ID_PATTERN,
  TURN_ID_MAX_LENGTH,
} from "./constants.ts";
import type { ClientMessage, ConnectParams, ErrorCode, Intent, Seat, Step } from "./types.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Splits a string into user-perceived characters (an emoji with modifiers counts as one). */
function splitGraphemes(text: string): string[] {
  return Array.from(graphemes.segment(text), (s) => s.segment);
}

/** Control characters (C0, DEL, C1) are removed from names, after whitespace is collapsed. */
const CONTROL_CHARS = /\p{Cc}/gu;

/** The other seat. */
export function opponent(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

/** `m{match}-r{round}-s{seat}-{step}`, e.g. `m2-r3-s1-power` (DEC-5). */
export function makeTurnId(match: number, round: number, seat: Seat, step: Step): string {
  return `m${match}-r${round}-s${seat}-${step}`;
}

/** Whether the server closes the connection after sending this error (DEC-3). */
export function isFatalError(code: ErrorCode): boolean {
  return (FATAL_ERROR_CODES as readonly ErrorCode[]).includes(code);
}

/**
 * For the client's nickname input: keeps at most NAME_MAX_LENGTH characters while typing or
 * pasting. Does not trim, so the player can still type a space between words.
 */
export function limitNameInput(raw: string): string {
  return splitGraphemes(raw).slice(0, NAME_MAX_LENGTH).join("");
}

/**
 * Server-side nickname sanitising (DEC-5): collapses whitespace (tabs and newlines become one
 * space), removes other control characters, trims, cuts to NAME_MAX_LENGTH characters. An empty result becomes `Player {seat}`.
 */
export function sanitizeName(raw: string, seat: Seat): string {
  const cleaned = raw.replace(/\s+/g, " ").replace(CONTROL_CHARS, "").trim();
  const limited = splitGraphemes(cleaned).slice(0, NAME_MAX_LENGTH).join("").trim();
  return limited === "" ? `Player ${seat}` : limited;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTurnId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= TURN_ID_MAX_LENGTH;
}

/**
 * Parses an untrusted client message. Returns a normalised message containing only the known
 * fields, or `null` (→ INVALID_MESSAGE) for invalid JSON, unknown types, wrong field types or
 * oversized input. Never throws.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "ready":
    case "rematch":
    case "leave":
      return { type: data.type };
    case "rollPower":
    case "rollCannon":
      return isValidTurnId(data.turnId) ? { type: data.type, turnId: data.turnId } : null;
    default:
      return null;
  }
}

/**
 * Reads `playerId`, `name` and `intent` from a connection URL. Returns `null` (→ fatal
 * INVALID_MESSAGE) if `playerId` is missing or malformed, or `intent` is not create/join.
 * A missing `name` becomes "" and is sanitised later.
 */
export function parseConnectParams(url: URL): ConnectParams | null {
  const playerId = url.searchParams.get("playerId");
  const intent = url.searchParams.get("intent");
  if (playerId === null || !PLAYER_ID_PATTERN.test(playerId)) return null;
  if (intent === null || !(INTENTS as readonly string[]).includes(intent)) return null;
  return { playerId, name: url.searchParams.get("name") ?? "", intent: intent as Intent };
}
