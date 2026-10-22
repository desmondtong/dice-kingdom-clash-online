import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, Intent, Seat } from "../../shared/types.ts";
import { isFatalError } from "../../shared/protocol.ts";
import {
  createPartyConnection,
  type ConnectionFactory,
  type ConnectionOptions,
  type RoomConnection,
} from "./connection.ts";
import { generateRoomCode, getPlayerId, hasJoinedRoom, rememberRoom } from "./identity.ts";
import { canSendIntent, initialRoomStore, roomReducer } from "./roomStore.ts";

/**
 * The real room server is the default. In development builds only, `?mock=<fixture|demo>`
 * switches to the fixture-driven mock (C-DEC-1).
 */
const createDefaultConnection: ConnectionFactory = (options) => {
  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && params.has("mock")) {
    let disposed = false;
    let connection: RoomConnection | undefined;
    void import("./mock/mockConnection.ts")
      .then(({ createMockFactory }) => {
        if (!disposed)
          connection = createMockFactory({
            mode: params.get("mock") ?? "demo",
            seat: params.get("seat") === "2" ? 2 : 1,
          })(options);
      })
      .catch(() => {
        if (!disposed)
          options.onMessage({
            type: "error",
            code: "ROOM_NOT_FOUND",
            message: "Mock failed to load",
          });
      });
    return {
      send: (intent) => connection?.send(intent),
      close() {
        disposed = true;
        connection?.close();
      },
    };
  }
  return createPartyConnection(options);
};

export interface UseRoomOptions {
  code: string;
  name: string;
  intent: Intent;
  enabled: boolean;
  onCodeChange: (code: string) => void;
  factory?: ConnectionFactory;
}
export function useRoom({
  code,
  name,
  intent,
  enabled,
  onCodeChange,
  factory = createDefaultConnection,
}: UseRoomOptions) {
  const [store, dispatch] = useReducer(roomReducer, undefined, initialRoomStore);
  const connection = useRef<RoomConnection | null>(null);
  const storeRef = useRef(store);
  const busy = useRef(false);
  const changeCode = useRef(onCodeChange);
  useEffect(() => {
    storeRef.current = store;
    changeCode.current = onCodeChange;
    if (!store.awaitingAction) busy.current = false;
  }, [store, onCodeChange]);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let active = 0;
    let attempt = 0;
    let activeCode = code;
    const connect = (connectIntent: Intent) => {
      const generation = ++active;
      let welcomed = false;
      const options: ConnectionOptions = {
        code: activeCode,
        playerId: getPlayerId(),
        name,
        intent: hasJoinedRoom(activeCode) ? "join" : connectIntent,
        onMessage(message) {
          if (disposed || generation !== active) return;
          if (
            message.type === "error" &&
            message.code === "CODE_TAKEN" &&
            connectIntent === "create" &&
            attempt < 5
          ) {
            connection.current?.close();
            attempt++;
            activeCode = generateRoomCode();
            connect("create");
            return;
          }
          if (message.type === "welcome") {
            welcomed = true;
            rememberRoom(message.code);
            if (message.code !== code) changeCode.current(message.code);
          }
          if (
            message.type === "error" &&
            (isFatalError(message.code) || (message.code === "INVALID_MESSAGE" && !welcomed))
          )
            connection.current?.close();
          if (message.type === "state" || message.type === "error") busy.current = false;
          dispatch({ type: "message", message, receivedAt: Date.now() });
        },
        onStatus(status) {
          if (!disposed && generation === active) dispatch({ type: "status", status });
        },
      };
      connection.current = factory(options);
    };
    connect(intent);
    return () => {
      disposed = true;
      active++;
      connection.current?.close();
      connection.current = null;
    };
    // Accepted collision retries update the URL, then reconnect with intent=join (X2).
  }, [enabled, name, intent, factory, code]);

  const send = useCallback((message: ClientMessage) => {
    if (
      !connection.current ||
      (busy.current && message.type !== "leave") ||
      !canSendIntent(storeRef.current, message)
    )
      return;
    if (message.type !== "leave") {
      busy.current = true;
      dispatch({ type: "sent" });
    }
    connection.current.send(message);
  }, []);
  const close = useCallback(() => {
    connection.current?.close();
    dispatch({ type: "status", status: "closed" });
  }, []);
  const markEventPlayed = useCallback((eventId: number) => {
    dispatch({ type: "played", eventId });
  }, []);
  return { ...store, send, close, markEventPlayed };
}
export function mockSeat(): Seat {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("seat") === "2"
    ? 2
    : 1;
}
