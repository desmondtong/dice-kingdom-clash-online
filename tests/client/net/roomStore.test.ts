import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../../shared/constants.ts";
import { fixtures, sampleErrors } from "../../../shared/fixtures/index.ts";
import { isFatalError } from "../../../shared/protocol.ts";
import type { RoomState } from "../../../shared/types.ts";
import {
  canSendIntent,
  FRIENDLY_ERRORS,
  initialRoomStore,
  roomReducer,
  type RoomStore,
} from "../../../src/net/roomStore.ts";
function snapshot(state: RoomState, store = initialRoomStore()): RoomStore {
  return roomReducer(store, {
    type: "message",
    message: { type: "state", state },
    receivedAt: state.serverNow - 500,
  });
}
function seated(state: RoomState) {
  return snapshot(
    state,
    roomReducer(initialRoomStore(), {
      type: "message",
      message: { type: "welcome", seat: 1, code: state.code },
      receivedAt: 0,
    }),
  );
}

describe("room reducer", () => {
  it("uses the private welcome seat", () => {
    const store = roomReducer(initialRoomStore(), {
      type: "message",
      message: { type: "welcome", seat: 2, code: "KX7P" },
      receivedAt: 0,
    });
    expect(store.seat).toBe(2);
  });
  it("ignores stale/equal versions and preserves clock/state/action lock", () => {
    const store = { ...snapshot(fixtures.resolvingCannon), awaitingAction: true };
    expect(snapshot(fixtures.playingCannonStep, store)).toBe(store);
    expect(snapshot(fixtures.resolvingCannon, store)).toBe(store);
  });
  it("keeps a previous authoritative snapshot and calculates clock offset", () => {
    const first = snapshot(fixtures.playingPowerStep);
    const second = snapshot(fixtures.resolvingPower, first);
    expect(second.previousState).toBe(first.state);
    expect(second.clockOffset).toBe(500);
  });
  it("queues an event once and never replays it after reconnect or a newer repeated event", () => {
    let store = snapshot(fixtures.resolvingCannon);
    expect(store.pendingEvent?.eventId).toBe(10);
    store = roomReducer(store, { type: "played", eventId: 9 });
    expect(store.pendingEvent?.eventId).toBe(10);
    store = roomReducer(store, { type: "played", eventId: 10 });
    store = roomReducer(store, { type: "status", status: "disconnected" });
    store = snapshot(fixtures.resolvingCannon, store);
    expect(store.status).toBe("connected");
    expect(store.pendingEvent).toBeNull();
    store = snapshot({ ...fixtures.resolvingCannon, version: 28 }, store);
    expect(store.pendingEvent).toBeNull();
  });
  it("does not queue an older event even in a newer state", () => {
    const store = roomReducer(snapshot(fixtures.resolvingCannon), { type: "played", eventId: 10 });
    expect(snapshot({ ...fixtures.resolvingPower, version: 28 }, store).pendingEvent).toBeNull();
  });
  it("releases action locks only on a newer snapshot or non-fatal error", () => {
    const store = roomReducer(seated(fixtures.playingCannonStep), { type: "sent" });
    expect(store.awaitingAction).toBe(true);
    expect(snapshot({ ...fixtures.playingCannonStep, version: 7 }, store).awaitingAction).toBe(
      false,
    );
    expect(
      roomReducer(store, { type: "message", message: sampleErrors.STALE_ACTION, receivedAt: 0 })
        .awaitingAction,
    ).toBe(false);
  });
  it.each(ERROR_CODES)("maps %s to friendly text and correct fatality", (code) => {
    const previous = seated(fixtures.playingCannonStep);
    const result = roomReducer(previous, {
      type: "message",
      message: sampleErrors[code],
      receivedAt: 0,
    });
    expect(FRIENDLY_ERRORS[code].length).toBeGreaterThan(15);
    expect(result.state).toBe(previous.state);
    expect(result.error?.fatal).toBe(isFatalError(code));
    if (isFatalError(code))
      expect(roomReducer(result, { type: "status", status: "connected" })).toBe(result);
  });
  it("INVALID_MESSAGE before welcome is a fatal connect error", () => {
    expect(
      roomReducer(initialRoomStore(), {
        type: "message",
        message: sampleErrors.INVALID_MESSAGE,
        receivedAt: 0,
      }).status,
    ).toBe("fatal");
  });
  it("guards turn IDs, phase, seat, connection and the immediate click latch", () => {
    const store = seated(fixtures.playingCannonStep);
    const intent = {
      type: "rollCannon",
      turnId: fixtures.playingCannonStep.match!.turnId,
    } as const;
    expect(canSendIntent(store, intent)).toBe(true);
    expect(canSendIntent({ ...store, seat: 2 }, intent)).toBe(false);
    expect(canSendIntent({ ...store, awaitingAction: true }, intent)).toBe(false);
    expect(canSendIntent({ ...store, status: "disconnected" }, intent)).toBe(false);
    expect(canSendIntent(store, { ...intent, turnId: "old" })).toBe(false);
    expect(canSendIntent(seated(fixtures.resolvingCannon), intent)).toBe(false);
  });
  it("allows ready/rematch only with both seats and without a previous vote", () => {
    expect(canSendIntent(seated(fixtures.lobbyWaiting), { type: "ready" })).toBe(false);
    expect(canSendIntent(seated(fixtures.lobbyBothJoined), { type: "ready" })).toBe(false);
    expect(canSendIntent({ ...seated(fixtures.lobbyBothJoined), seat: 2 }, { type: "ready" })).toBe(
      true,
    );
    expect(canSendIntent(seated(fixtures.finishedLeft), { type: "rematch" })).toBe(false);
    expect(canSendIntent(seated(fixtures.finishedKo), { type: "rematch" })).toBe(true);
    expect(
      canSendIntent({ ...seated(fixtures.finishedRematchVoted), seat: 2 }, { type: "rematch" }),
    ).toBe(false);
  });
});
