import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures } from "../../../shared/fixtures/index.ts";
import type { RoomState, ServerMessage } from "../../../shared/types.ts";
import { createMockFactory } from "../../../src/net/mock/mockConnection.ts";
function setup(mode: string, seat: 1 | 2) {
  const messages: ServerMessage[] = [];
  const connection = createMockFactory({ mode, seat })({
    code: "ABCD",
    name: "Alex",
    playerId: "mock-player",
    intent: "join",
    onStatus: vi.fn(),
    onMessage: (message) => messages.push(message),
  });
  const state = () => {
    const message = [...messages].reverse().find((message) => message.type === "state");
    if (!message || message.type !== "state") throw new Error("No snapshot");
    return message.state;
  };
  return { messages, connection, state };
}
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
describe("recorded mock connection", () => {
  it.each(Object.keys(fixtures))("renders static %s without advancing", (name) => {
    const { messages, connection, state } = setup(name, 2);
    vi.advanceTimersByTime(0);
    expect(messages[0]).toEqual({ type: "welcome", seat: 2, code: "ABCD" });
    const current = state();
    expect(current.code).toBe("ABCD");
    expect(current.phase).toBe(fixtures[name as keyof typeof fixtures].phase);
    vi.advanceTimersByTime(60_000);
    expect(state()).toBe(current);
    connection.close();
  });
  it.each([1, 2] as const)(
    "plays all eight scripted rounds for seat %s and alternates on rematch",
    (seat) => {
      const { messages, connection, state } = setup("demo", seat);
      vi.advanceTimersByTime(0);
      vi.advanceTimersByTime(60_000);
      expect(state().phase).toBe("finished");
      const snapshots = messages
        .filter(
          (message): message is { type: "state"; state: RoomState } => message.type === "state",
        )
        .map((message) => message.state);
      expect(
        new Set(snapshots.flatMap((snapshot) => (snapshot.match ? [snapshot.match.round] : []))),
      ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(
        snapshots.every(
          (snapshot, index) => index === 0 || snapshot.version > snapshots[index - 1]!.version,
        ),
      ).toBe(true);
      const firstMatch = state().match!;
      connection.send({ type: "rematch" });
      expect(state().rematchVotes).toEqual([seat]);
      vi.advanceTimersByTime(1_200);
      expect(state().phase).toBe("countdown");
      expect(state().match!.number).toBe(firstMatch.number + 1);
      expect(state().match!.firstSeat).not.toBe(firstMatch.firstSeat);
      expect(state().rematchVotes).toEqual([]);
      connection.close();
    },
  );
  it("answers a valid click with a next fixture and never derives damage or HP", () => {
    const { connection, state } = setup("demo", 1);
    vi.advanceTimersByTime(0);
    connection.send({ type: "ready" });
    vi.advanceTimersByTime(3_000);
    expect(state().match!.step).toBe("cannon");
    connection.send({ type: "rollCannon", turnId: state().match!.turnId });
    expect(state().match!.step).toBe("resolving");
    expect(state().match!.towers).toEqual(fixtures.resolvingCannon.match!.towers);
    connection.close();
  });
  it("cancels timers on close and reports unknown fixtures", () => {
    const { messages, connection } = setup("demo", 1);
    connection.close();
    vi.advanceTimersByTime(60_000);
    expect(messages).toHaveLength(0);
    const unknown = setup("bad-fixture", 1);
    vi.advanceTimersByTime(0);
    expect(unknown.messages.at(-1)).toMatchObject({ type: "error", code: "ROOM_NOT_FOUND" });
    unknown.connection.close();
  });
});
