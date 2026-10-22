import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, sampleErrors } from "../../../shared/fixtures/index.ts";
import { FATAL_ERROR_CODES } from "../../../shared/constants.ts";
import { createPartyConnection, parseServerMessage } from "../../../src/net/connection.ts";
const fake = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  listeners: new Map<string, (event: { data?: string }) => void>(),
  close: vi.fn(),
  send: vi.fn(),
}));
vi.mock("partysocket", () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      fake.options = options;
    }
    addEventListener(type: string, callback: (event: { data?: string }) => void) {
      fake.listeners.set(type, callback);
    }
    close = fake.close;
    send = fake.send;
  },
}));
function connect() {
  const onMessage = vi.fn();
  const onStatus = vi.fn();
  const connection = createPartyConnection({
    code: "KX7P",
    playerId: "player-id-123",
    name: "Alex",
    intent: "join",
    onMessage,
    onStatus,
  });
  return { connection, onMessage, onStatus };
}
function message(data: unknown) {
  fake.listeners.get("message")?.({ data: JSON.stringify(data) });
}
describe("PartySocket adapter (fake socket only)", () => {
  beforeEach(() => {
    fake.listeners.clear();
    vi.clearAllMocks();
  });
  it("uses localhost:1999, party main, code and only the agreed connection identity", () => {
    connect();
    expect(fake.options).toEqual({
      host: "localhost:1999",
      party: "main",
      room: "KX7P",
      query: { playerId: "player-id-123", name: "Alex", intent: "join" },
    });
  });
  it("reports transport loss but waits for a snapshot after opening", () => {
    const { onStatus } = connect();
    fake.listeners.get("open")?.({});
    fake.listeners.get("close")?.({});
    expect(onStatus.mock.calls).toEqual([["connecting"], ["disconnected"]]);
  });
  it.each(FATAL_ERROR_CODES)(
    "closes on %s before delivering error, never resumes or reconnects",
    (code) => {
      const { connection, onMessage, onStatus } = connect();
      message(sampleErrors[code]);
      expect(fake.close).toHaveBeenCalledOnce();
      expect(onMessage).toHaveBeenCalledWith(sampleErrors[code]);
      fake.listeners.get("close")?.({});
      connection.send({ type: "ready" });
      expect(onStatus).not.toHaveBeenCalled();
      expect(fake.send).not.toHaveBeenCalled();
    },
  );
  it("closes INVALID_MESSAGE during connect, but keeps it non-fatal after welcome", () => {
    connect();
    message(sampleErrors.INVALID_MESSAGE);
    expect(fake.close).toHaveBeenCalledOnce();
    fake.close.mockClear();
    connect();
    message({ type: "welcome", seat: 1, code: "KX7P" });
    message(sampleErrors.INVALID_MESSAGE);
    expect(fake.close).not.toHaveBeenCalled();
  });
  it("sends leave before close and closes exactly once", () => {
    const { connection } = connect();
    connection.send({ type: "leave" });
    connection.close();
    expect(fake.send).toHaveBeenCalledWith('{"type":"leave"}');
    expect(fake.close).toHaveBeenCalledOnce();
    expect(fake.send.mock.invocationCallOrder[0]!).toBeLessThan(
      fake.close.mock.invocationCallOrder[0]!,
    );
  });
  it("sends intents only and ignores malformed messages", () => {
    const { connection, onMessage } = connect();
    connection.send({ type: "rollCannon", turnId: "m1-r1-s1-cannon" });
    expect(JSON.parse(fake.send.mock.calls[0]![0])).toEqual({
      type: "rollCannon",
      turnId: "m1-r1-s1-cannon",
    });
    fake.listeners.get("message")?.({ data: "not-json" });
    message({ type: "state", state: {} });
    expect(onMessage).not.toHaveBeenCalled();
  });
  it.each(Object.entries(fixtures))("parses the %s frozen fixture", (_, state) => {
    expect(parseServerMessage(JSON.stringify({ type: "state", state }))).toEqual({
      type: "state",
      state,
    });
  });
  it("rejects missing nested data without throwing", () => {
    for (const raw of [
      null,
      "{}",
      '{"type":"welcome","seat":3,"code":"KX7P"}',
      JSON.stringify({ type: "state", state: { ...fixtures.playingCannonStep, match: {} } }),
    ])
      expect(parseServerMessage(raw)).toBeNull();
  });
});
