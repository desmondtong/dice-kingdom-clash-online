import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures } from "../../../shared/fixtures/index.ts";
import type { ServerMessage } from "../../../shared/types.ts";
import type { ConnectionOptions } from "../../../src/net/connection.ts";
import { useRoom } from "../../../src/net/useRoom.ts";
function setup(intent: "join" | "create" = "join") {
  const connections: {
    options: ConnectionOptions;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const factory = (options: ConnectionOptions) => {
    const connection = { options, send: vi.fn(), close: vi.fn() };
    connections.push(connection);
    return connection;
  };
  const onCodeChange = vi.fn();
  const hook = renderHook(() =>
    useRoom({ code: "KX7P", name: "Alex", intent, enabled: true, onCodeChange, factory }),
  );
  const receive = (message: ServerMessage) =>
    act(() => connections.at(-1)!.options.onMessage(message));
  return { ...hook, connections, onCodeChange, receive };
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
describe("room lifecycle", () => {
  it("always joins a remembered room with the same tab identity", () => {
    sessionStorage.setItem("dkc.rooms", '["KX7P"]');
    const { connections, unmount } = setup("create");
    expect(connections[0]!.options.intent).toBe("join");
    expect(connections[0]!.options.playerId).toMatch(/^[a-f0-9-]{36}$/);
    unmount();
    expect(connections[0]!.close).toHaveBeenCalledOnce();
  });
  it("remembers welcome and disables double-clicks until a newer snapshot", () => {
    const { result, connections, receive } = setup();
    receive({ type: "welcome", seat: 1, code: "KX7P" });
    receive({ type: "state", state: fixtures.playingCannonStep });
    const intent = {
      type: "rollCannon",
      turnId: fixtures.playingCannonStep.match!.turnId,
    } as const;
    act(() => {
      result.current.send(intent);
      result.current.send(intent);
    });
    expect(connections[0]!.send).toHaveBeenCalledOnce();
    expect(result.current.awaitingAction).toBe(true);
    receive({ type: "state", state: fixtures.playingCannonStep });
    expect(result.current.awaitingAction).toBe(true);
    receive({ type: "error", code: "STALE_ACTION", message: "stale" });
    expect(result.current.awaitingAction).toBe(false);
    expect(sessionStorage.getItem("dkc.rooms")).toContain("KX7P");
  });
  it("retries CODE_TAKEN no more than five times and reports final failure", () => {
    const { result, connections, receive, onCodeChange } = setup("create");
    for (let i = 0; i < 6; i++) receive({ type: "error", code: "CODE_TAKEN", message: "taken" });
    expect(connections).toHaveLength(6);
    expect(result.current.error?.fatal).toBe(true);
    expect(onCodeChange).not.toHaveBeenCalled();
    for (const connection of connections) expect(connection.close).toHaveBeenCalled();
  });
  it("updates the URL only after a retried code is accepted", () => {
    const { connections, receive, onCodeChange } = setup("create");
    receive({ type: "error", code: "CODE_TAKEN", message: "taken" });
    const code = connections[1]!.options.code;
    receive({ type: "welcome", seat: 1, code });
    expect(onCodeChange).toHaveBeenCalledWith(code);
  });
  it("disables actions on disconnect until a fresh snapshot (even same version)", () => {
    const { result, connections, receive } = setup();
    receive({ type: "welcome", seat: 1, code: "KX7P" });
    receive({ type: "state", state: fixtures.playingCannonStep });
    act(() => connections[0]!.options.onStatus("disconnected"));
    expect(result.current.status).toBe("disconnected");
    act(() => connections[0]!.options.onStatus("connecting"));
    expect(result.current.status).not.toBe("connected");
    receive({ type: "state", state: fixtures.playingCannonStep });
    expect(result.current.status).toBe("connected");
  });
  it("closes on leave and does not accept late messages", () => {
    const { result, connections, receive } = setup();
    receive({ type: "welcome", seat: 1, code: "KX7P" });
    receive({ type: "state", state: fixtures.playingCannonStep });
    act(() => {
      result.current.send({ type: "leave" });
      result.current.close();
    });
    expect(connections[0]!.send).toHaveBeenCalledWith({ type: "leave" });
    expect(connections[0]!.close).toHaveBeenCalled();
    receive({ type: "state", state: { ...fixtures.playingCannonStep, version: 7 } });
    expect(result.current.status).toBe("closed");
  });
});
