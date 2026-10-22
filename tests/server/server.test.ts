import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Party from "partykit/server";
import RoomServer from "../../party/server.ts";
import { COUNTDOWN_MS } from "../../shared/constants.ts";
import type { ServerMessage } from "../../shared/types.ts";
import { assertServerMessage } from "./helpers.ts";

function adapterHarness() {
  const messages: Record<string, ServerMessage[]> = {};
  const connections = new Map<string, Party.Connection>();
  const room = { id: "KX7P", getConnection: (id: string) => connections.get(id) } as Party.Room;
  const server = new RoomServer(room);
  const connect = (id: string, playerId = `${id}-identity`, intent = "join") => {
    messages[id] = [];
    const connection = {
      id,
      send: vi.fn((raw: string) => {
        const message: unknown = JSON.parse(raw);
        assertServerMessage(message);
        messages[id]!.push(message);
      }),
      close: vi.fn(),
    } as unknown as Party.Connection;
    connections.set(id, connection);
    const url = new URL("http://localhost:1999/parties/main/KX7P");
    url.searchParams.set("playerId", playerId);
    url.searchParams.set("intent", intent);
    server.onConnect(connection, { request: new Request(url) } as Party.ConnectionContext);
    return connection;
  };
  return { server, connect, messages, connections };
}

afterEach(() => vi.useRealTimers());

describe("PartyKit adapter", () => {
  it("serializes welcome/state, forwards real timers/messages, disconnects and reconnects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const h = adapterHarness();
    const a = h.connect("a", "a-identity", "create"),
      b = h.connect("b");
    expect(h.messages.a?.[0]).toEqual({ type: "welcome", code: "KX7P", seat: 1 });
    h.server.onMessage('{"type":"ready"}', a);
    h.server.onMessage('{"type":"ready"}', b);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(h.messages.b?.at(-1)).toMatchObject({ type: "state", state: { phase: "playing" } });
    h.server.onClose(a);
    expect(h.messages.b?.at(-1)).toMatchObject({
      type: "state",
      state: { players: { 1: { connected: false } } },
    });
    const next = h.connect("a2", "a-identity");
    h.server.onMessage(new Uint8Array([0]), next);
    expect(h.messages.a2?.at(-1)).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
    h.server.onMessage('{"type":"leave"}', next);
    expect(next.close).toHaveBeenCalledWith(1000, "leave");
    expect(h.messages.b?.at(-1)).toMatchObject({
      type: "state",
      state: { result: { reason: "left", winner: 2 } },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends fatal errors before closing and safely ignores unavailable transports", () => {
    const h = adapterHarness();
    const missing = h.connect("missing");
    expect(h.messages.missing?.at(-1)).toMatchObject({ type: "error", code: "ROOM_NOT_FOUND" });
    expect(missing.close).toHaveBeenCalledWith(4000, "ROOM_NOT_FOUND");
    const a = h.connect("a", "a-identity", "create"),
      b = h.connect("b");
    h.connections.delete("a");
    expect(() => h.server.onError(a)).not.toThrow();
    expect(h.messages.b?.at(-1)).toMatchObject({
      type: "state",
      state: { players: { 1: { connected: false } } },
    });
    h.server.onMessage('{"type":"leave"}', b);
  });
});
