import { isFatalError, opponent } from "../../shared/protocol.ts";
import type {
  ClientMessage,
  ErrorCode,
  GameEvent,
  RoomState,
  Seat,
  ServerMessage,
} from "../../shared/types.ts";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "closed" | "fatal";
export interface RoomError {
  code: ErrorCode;
  message: string;
  fatal: boolean;
}
export interface RoomStore {
  state: RoomState | null;
  previousState: RoomState | null;
  seat: Seat | null;
  status: ConnectionStatus;
  error: RoomError | null;
  pendingEvent: GameEvent | null;
  highestEventId: number;
  clockOffset: number;
  awaitingAction: boolean;
}
export const FRIENDLY_ERRORS: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: "That room does not exist. Check the code or create a new room.",
  CODE_TAKEN: "We could not find a free room code. Please try creating a room again.",
  ROOM_FULL: "That room already has two players. Try another code.",
  GAME_IN_PROGRESS: "A match is already underway in that room. Join a new room instead.",
  REPLACED_BY_NEW_TAB: "Your seat was opened in another tab. Continue there, or return home.",
  NOT_YOUR_TURN: "It is your opponent's turn. Wait for your turn banner.",
  STALE_ACTION: "The turn has moved on. Use the latest action on the board.",
  INVALID_PHASE: "That action is not available right now. Please check the board.",
  INVALID_MESSAGE: "The room could not understand that request. Please try again.",
};
export function initialRoomStore(): RoomStore {
  return {
    state: null,
    previousState: null,
    seat: null,
    status: "connecting",
    error: null,
    pendingEvent: null,
    highestEventId: -1,
    clockOffset: 0,
    awaitingAction: false,
  };
}
export type RoomAction =
  | { type: "message"; message: ServerMessage; receivedAt: number }
  | { type: "status"; status: ConnectionStatus }
  | { type: "sent" }
  | { type: "played"; eventId: number };

export function roomReducer(store: RoomStore, action: RoomAction): RoomStore {
  if (action.type === "played")
    return store.pendingEvent?.eventId === action.eventId
      ? { ...store, pendingEvent: null }
      : store;
  if (store.status === "fatal" || store.status === "closed") return store;
  if (action.type === "status") return { ...store, status: action.status };
  if (action.type === "sent") return { ...store, awaitingAction: true, error: null };
  const message = action.message;
  if (message.type === "welcome") return { ...store, seat: message.seat };
  if (message.type === "error") {
    const fatal =
      isFatalError(message.code) || (message.code === "INVALID_MESSAGE" && store.seat === null);
    return {
      ...store,
      error: { code: message.code, message: FRIENDLY_ERRORS[message.code], fatal },
      status: fatal ? "fatal" : store.status,
      awaitingAction: false,
    };
  }
  if (store.state && message.state.version <= store.state.version) {
    // A fresh reconnect snapshot can have the same version; recover transport readiness only.
    return store.status === "connected" ? store : { ...store, status: "connected" };
  }
  const event = message.state.lastEvent;
  const isNewEvent = event !== null && event.eventId > store.highestEventId;
  return {
    ...store,
    previousState: store.state,
    state: message.state,
    status: "connected",
    error: null,
    awaitingAction: false,
    clockOffset: message.state.serverNow - action.receivedAt,
    pendingEvent: isNewEvent ? event : store.pendingEvent,
    highestEventId: isNewEvent ? event.eventId : store.highestEventId,
  };
}

/** The network guard mirrors UI eligibility, but never evaluates a game outcome. */
export function canSendIntent(store: RoomStore, intent: ClientMessage): boolean {
  if (intent.type === "leave") return store.status !== "closed" && store.status !== "fatal";
  const { state, seat } = store;
  if (!state || !seat || store.status !== "connected" || store.awaitingAction) return false;
  if (intent.type === "ready")
    return (
      state.phase === "lobby" &&
      !!state.players[1] &&
      !!state.players[2] &&
      !state.players[seat]?.ready
    );
  if (intent.type === "rematch")
    return (
      state.phase === "finished" &&
      state.result?.reason !== "left" &&
      !!state.players[opponent(seat)] &&
      !state.rematchVotes.includes(seat)
    );
  const step = intent.type === "rollPower" ? "power" : "cannon";
  return (
    state.phase === "playing" &&
    state.match?.currentSeat === seat &&
    state.match.step === step &&
    state.match.turnId === intent.turnId
  );
}
