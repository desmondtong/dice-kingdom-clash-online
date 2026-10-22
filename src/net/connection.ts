import PartySocket from "partysocket";
import { ERROR_CODES, PHASES, SEATS, STEPS } from "../../shared/constants.ts";
import { isFatalError } from "../../shared/protocol.ts";
import type { ClientMessage, ConnectParams, RoomState, ServerMessage } from "../../shared/types.ts";
import type { ConnectionStatus } from "./roomStore.ts";

export interface RoomConnection {
  send(intent: ClientMessage): void;
  close(): void;
}
export interface ConnectionOptions extends ConnectParams {
  code: string;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}
export type ConnectionFactory = (options: ConnectionOptions) => RoomConnection;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validState(value: unknown): value is RoomState {
  if (
    !record(value) ||
    typeof value.code !== "string" ||
    !PHASES.some((phase) => phase === value.phase) ||
    !SEATS.some((seat) => seat === value.hostSeat) ||
    !Number.isSafeInteger(value.version) ||
    typeof value.serverNow !== "number" ||
    !Number.isFinite(value.serverNow) ||
    !record(value.players) ||
    !Array.isArray(value.rematchVotes) ||
    !value.rematchVotes.every((seat) => seat === 1 || seat === 2)
  )
    return false;
  for (const seat of SEATS) {
    const player = value.players[seat];
    if (
      player !== undefined &&
      (!record(player) ||
        typeof player.name !== "string" ||
        typeof player.connected !== "boolean" ||
        typeof player.ready !== "boolean")
    )
      return false;
  }
  if (value.phase === "lobby") {
    if (value.match !== null) return false;
  } else {
    const match = value.match;
    if (
      !record(match) ||
      !STEPS.some((step) => step === match.step) ||
      !SEATS.some((seat) => seat === match.currentSeat) ||
      !SEATS.some((seat) => seat === match.firstSeat) ||
      typeof match.turnId !== "string" ||
      !Number.isFinite(match.turnDeadline) ||
      !Number.isFinite(match.towerSeed) ||
      !Number.isInteger(match.round) ||
      !Number.isInteger(match.number) ||
      !record(match.towers)
    )
      return false;
    for (const seat of SEATS) {
      const tower = match.towers[seat];
      if (
        !record(tower) ||
        !Number.isInteger(tower.hp) ||
        typeof tower.shield !== "boolean" ||
        typeof tower.reflectNextAttack !== "boolean"
      )
        return false;
    }
  }
  if (
    value.countdownEndsAt !== null &&
    (typeof value.countdownEndsAt !== "number" || !Number.isFinite(value.countdownEndsAt))
  )
    return false;
  if (value.phase === "countdown" && value.countdownEndsAt === null) return false;
  if (
    value.result !== null &&
    (!record(value.result) ||
      ![1, 2, "tie"].includes(value.result.winner as number | string) ||
      !["ko", "rounds", "left"].includes(String(value.result.reason)))
  )
    return false;
  if (value.phase === "finished" && value.result === null) return false;
  const event = value.lastEvent;
  if (event !== null) {
    if (
      !record(event) ||
      !Number.isSafeInteger(event.eventId) ||
      !SEATS.some((seat) => seat === event.actor)
    )
      return false;
    if (event.type === "cannon") {
      if (
        !Array.isArray(event.dice) ||
        event.dice.length !== 2 ||
        !event.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6) ||
        !Number.isFinite(event.rawDamage) ||
        !Number.isFinite(event.damage) ||
        !SEATS.some((seat) => seat === event.target) ||
        typeof event.reflected !== "boolean" ||
        typeof event.shielded !== "boolean"
      )
        return false;
    } else if (event.type === "power") {
      if (
        !["shield", "ricochet", "heal", "swap"].includes(String(event.power)) ||
        typeof event.auto !== "boolean"
      )
        return false;
    } else if (event.type !== "turnSkipped") return false;
  }
  return true;
}
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data)) return null;
    if (
      data.type === "welcome" &&
      (data.seat === 1 || data.seat === 2) &&
      typeof data.code === "string"
    )
      return { type: "welcome", seat: data.seat, code: data.code };
    if (data.type === "state" && validState(data.state))
      return { type: "state", state: data.state };
    if (
      data.type === "error" &&
      ERROR_CODES.some((code) => code === data.code) &&
      typeof data.message === "string"
    )
      return data as unknown as ServerMessage;
  } catch {
    /* Malformed server data is ignored, never allowed to crash the board. */
  }
  return null;
}

export const createPartyConnection: ConnectionFactory = (options) => {
  const socket = new PartySocket({
    host: "localhost:1999",
    party: "main",
    room: options.code,
    query: { playerId: options.playerId, name: options.name, intent: options.intent },
  });
  let closed = false;
  let welcomed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      socket.close();
    }
  };
  socket.addEventListener("open", () => {
    if (!closed) options.onStatus("connecting");
  });
  socket.addEventListener("close", () => {
    if (!closed) options.onStatus("disconnected");
  });
  socket.addEventListener("error", () => {
    if (!closed) options.onStatus("disconnected");
  });
  socket.addEventListener("message", (event: MessageEvent) => {
    if (closed) return;
    const message = parseServerMessage(event.data);
    if (!message) return;
    if (message.type === "welcome") welcomed = true;
    // Closing before delivery prevents reconnect even if the callback navigates or retries.
    if (
      message.type === "error" &&
      (isFatalError(message.code) || (message.code === "INVALID_MESSAGE" && !welcomed))
    )
      close();
    options.onMessage(message);
  });
  return {
    close,
    send(intent) {
      if (closed) return;
      socket.send(JSON.stringify(intent));
      if (intent.type === "leave") close();
    },
  };
};
