import { describe, expect, it } from "vitest";
import {
  CANNON_RESOLVE_MS,
  COUNTDOWN_MS,
  POWER_RESOLVE_MS,
  STEP_MS,
} from "../../shared/constants.ts";
import { fixtures } from "../../shared/fixtures/index.ts";
import type { Seat } from "../../shared/types.ts";
import { harness } from "./helpers.ts";

function untilRound(h: ReturnType<typeof harness>, round: number): void {
  while (h.state().match!.round < round) h.scheduler.advance(STEP_MS);
}

function finishByTimeout(h: ReturnType<typeof harness>): void {
  for (let i = 0; h.state().phase !== "finished" && i < 50; i++) {
    h.scheduler.advance(h.state().match!.step === "resolving" ? POWER_RESOLVE_MS : STEP_MS);
  }
  expect(h.state().phase).toBe("finished");
}

describe("room connections and privacy", () => {
  it("creates seat 1, sanitises names and sends a private welcome before state", () => {
    const h = harness();
    h.connect("a", "a-identity", "create", "  Alice   Smith extra  ");
    expect(h.sent.map((x) => x.message.type)).toEqual(["welcome", "state"]);
    expect(h.sent[0]).toEqual({ id: "a", message: { type: "welcome", code: "KX7P", seat: 1 } });
    expect(h.state()).toMatchObject({
      phase: "lobby",
      hostSeat: 1,
      match: null,
      players: { 1: { name: "Alice Smith", connected: true, ready: false } },
    });
    expect(h.state().phase).toBe(fixtures.lobbyWaiting.phase);
  });

  it("joins the free seat, sanitises blank names and broadcasts the same snapshot to both", () => {
    const h = harness();
    h.connect("a", "a-identity", "create", "");
    h.connect("b", "b-identity", "join", "");
    expect(h.state().players).toEqual({
      1: { name: "Player 1", connected: true, ready: false },
      2: { name: "Player 2", connected: true, ready: false },
    });
    expect(h.state("a")).toEqual(h.state("b"));
    expect(h.sent.filter((x) => x.id === "a" && x.message.type === "welcome")).toHaveLength(1);
    expect(JSON.stringify(h.sent)).not.toContain("a-identity");
    expect(JSON.stringify(h.sent)).not.toContain("b-identity");
  });

  it.each([
    "http://localhost:1999/?intent=create",
    "http://localhost:1999/?playerId=short&intent=create",
    "http://localhost:1999/?playerId=valid-id&intent=unknown",
    "not a url",
  ])("rejects invalid connect input %s with fatal INVALID_MESSAGE", (url) => {
    const h = harness();
    h.controller.onConnect("bad", url);
    expect(h.error("bad")).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
    expect(h.closed).toEqual([{ id: "bad", code: 4000, reason: "INVALID_MESSAGE" }]);
    expect(h.scheduler.active.size).toBe(0);
  });

  it("rejects joining a never-created or discarded room", () => {
    const h = harness();
    h.connect("b");
    expect(h.error("b")).toMatchObject({ code: "ROOM_NOT_FOUND" });
    h.connect("a", "a-identity", "create");
    h.send("a", { type: "leave" });
    h.connect("c");
    expect(h.error("c")).toMatchObject({ code: "ROOM_NOT_FOUND" });
    h.connect("d", "d-identity", "create");
    expect(h.state().players[1]?.name).toBe("d");
  });

  it("rejects code collisions and a full lobby with the agreed close codes", () => {
    const h = harness();
    h.pair();
    h.connect("c", "c-identity", "create");
    h.connect("d");
    expect(h.closed).toEqual([
      { id: "c", code: 4000, reason: "CODE_TAKEN" },
      { id: "d", code: 4000, reason: "ROOM_FULL" },
    ]);
  });

  it.each(["countdown", "playing", "finished"])("rejects new identities in %s", (phase) => {
    const h = harness();
    h.pair();
    h.send("a", { type: "ready" });
    h.send("b", { type: "ready" });
    if (phase !== "countdown") h.scheduler.advance(COUNTDOWN_MS);
    if (phase === "finished") h.send("a", { type: "leave" });
    const before = h.sent.length;
    h.connect("c");
    expect(h.error("c")).toMatchObject({ code: "GAME_IN_PROGRESS" });
    expect(h.sent).toHaveLength(before + 1);
    expect(h.closed.at(-1)?.code).toBe(4000);
  });

  it.each(["create", "join"])(
    "reconnects known identities with intent=%s and retains their original names",
    (intent) => {
      const h = harness();
      h.play();
      const before = h.state().match;
      h.controller.onClose("a");
      expect(h.state("b").players[1]?.connected).toBe(false);
      h.connect("a2", "a-identity", intent, "Changed name");
      expect(h.sent.filter((x) => x.id === "a2").map((x) => x.message.type)).toEqual([
        "welcome",
        "state",
      ]);
      expect(h.state().players[1]).toEqual({ name: "a", ready: true, connected: true });
      expect(h.state().match).toEqual(before);
      expect(h.scheduler.active.size).toBe(1);
    },
  );

  it("replaces a second tab, ignores old-tab messages and close, and keeps the new tab connected", () => {
    const h = harness();
    h.play();
    h.connect("a2", "a-identity", "join");
    expect(h.error("a")).toMatchObject({ code: "REPLACED_BY_NEW_TAB" });
    expect(h.closed.at(-1)).toEqual({ id: "a", code: 4000, reason: "REPLACED_BY_NEW_TAB" });
    const count = h.sent.length;
    h.controller.onClose("a");
    h.send("a", { type: "leave" });
    expect(h.sent).toHaveLength(count);
    expect(h.state().players[1]?.connected).toBe(true);
    h.send("a2", { type: "rollCannon", turnId: h.state().match!.turnId });
    expect(h.state().match?.step).toBe("resolving");
  });

  it("takes no action for unbound connections or repeated closes", () => {
    const h = harness();
    h.pair();
    const count = h.sent.length;
    h.controller.onMessage("unknown", "bad");
    h.controller.onClose("unknown");
    expect(h.sent).toHaveLength(count);
    h.controller.onClose("b");
    const disconnected = h.sent.length;
    h.controller.onClose("b");
    expect(h.sent).toHaveLength(disconnected);
  });
});

describe("ready, leave, and disconnect", () => {
  it("rejects ready alone; duplicate ready in lobby is a no-op", () => {
    const h = harness();
    h.connect("a", "a-identity", "create");
    h.send("a", { type: "ready" });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
    h.connect("b");
    h.send("a", { type: "ready" });
    const count = h.sent.length;
    h.send("a", { type: "ready" });
    expect(h.sent).toHaveLength(count);
    expect(h.state().players[1]?.ready).toBe(true);
  });

  it("counts a disconnected player's existing ready flag and keeps countdown running", () => {
    const h = harness();
    h.pair();
    h.send("a", { type: "ready" });
    h.controller.onClose("a");
    h.send("b", { type: "ready" });
    expect(h.state().phase).toBe("countdown");
    const start = h.scheduler.now;
    expect(h.state().countdownEndsAt).toBe(start + COUNTDOWN_MS);
    expect(h.state().match?.turnDeadline).toBe(0);
    h.scheduler.advance(COUNTDOWN_MS - 1);
    expect(h.state().phase).toBe("countdown");
    h.scheduler.advance(1);
    expect(h.state().phase).toBe("playing");
    expect(h.state().match?.turnDeadline).toBe(start + COUNTDOWN_MS + STEP_MS);
    expect(h.state().players[1]?.connected).toBe(false);
  });

  it.each([1, 2] as const)(
    "leave in lobby frees seat %i, resets ready, and promotes the remaining host",
    (seat) => {
      const h = harness();
      h.pair();
      h.send("a", { type: "ready" });
      h.send(seat === 1 ? "a" : "b", { type: "leave" });
      const other = seat === 1 ? 2 : 1;
      expect(h.state().hostSeat).toBe(other);
      expect(h.state().players[seat]).toBeUndefined();
      expect(h.state().players[other]?.ready).toBe(false);
      expect(h.closed.at(-1)?.code).toBe(1000);
      h.connect("c");
      expect(h.state().players[seat]?.name).toBe("c");
      if (seat === 1) {
        h.send("b", { type: "ready" });
        h.send("c", { type: "ready" });
        expect(h.state().match?.firstSeat).toBe(2);
      }
    },
  );

  it("cancels countdown leave without a result and ignores a late countdown callback", () => {
    const h = harness();
    h.pair();
    h.send("a", { type: "ready" });
    h.send("b", { type: "ready" });
    const callback = h.scheduler.history.get(h.scheduler.next)!;
    h.send("a", { type: "leave" });
    expect(h.state()).toMatchObject({
      phase: "lobby",
      match: null,
      result: null,
      countdownEndsAt: null,
      hostSeat: 2,
    });
    expect(h.scheduler.active.size).toBe(0);
    const count = h.sent.length;
    callback();
    h.scheduler.advance(COUNTDOWN_MS);
    expect(h.sent).toHaveLength(count);
  });

  it.each(["cannon", "power", "resolving"])(
    "leave during %s ends play immediately with reason left and cancels timers",
    (step) => {
      const h = harness();
      h.play();
      if (step === "power") untilRound(h, 3);
      if (step === "resolving") h.roll();
      const stale = h.scheduler.history.get(h.scheduler.next)!;
      h.send("a", { type: "leave" });
      expect(h.state()).toMatchObject({
        phase: "finished",
        hostSeat: 2,
        result: { winner: 2, reason: "left" },
        rematchVotes: [],
      });
      expect(h.scheduler.active.size).toBe(0);
      const count = h.sent.length;
      stale();
      h.scheduler.advance(100_000);
      expect(h.sent).toHaveLength(count);
      h.send("b", { type: "rematch" });
      expect(h.error("b")).toMatchObject({ code: "INVALID_PHASE" });
      h.connect("c");
      expect(h.error("c")).toMatchObject({ code: "GAME_IN_PROGRESS" });
    },
  );

  it("clears rematch votes on finished leave and discards the room after its last Leave", () => {
    const h = harness();
    h.play();
    finishByTimeout(h);
    const result = h.state().result;
    h.send("a", { type: "rematch" });
    expect(h.state().rematchVotes).toEqual([1]);
    h.send("a", { type: "leave" });
    expect(h.state().rematchVotes).toEqual([]);
    expect(h.state().result).toEqual(result);
    h.send("b", { type: "leave" });
    expect(h.scheduler.active.size).toBe(0);
    h.connect("c", "c-identity", "create");
    expect(h.state().phase).toBe("lobby");
    expect(h.state().players[1]?.name).toBe("c");
  });

  it("holds disconnected seats, skips their cannon and auto-rolls their power", () => {
    const h = harness();
    h.play();
    h.controller.onClose("a");
    h.scheduler.advance(STEP_MS);
    expect(h.state("b").lastEvent).toMatchObject({ type: "turnSkipped", actor: 1 });
    untilRound(h, 3);
    expect(h.state().match).toMatchObject({ round: 3, currentSeat: 1, step: "power" });
    h.scheduler.advance(STEP_MS);
    expect(h.state().lastEvent).toMatchObject({ type: "power", actor: 1, auto: true });
    expect(h.state().players[1]?.connected).toBe(false);
    h.connect("a2", "a-identity");
    expect(h.state().players[1]?.connected).toBe(true);
  });
});

describe("intent validation, deadlines, and resolving windows", () => {
  it.each([
    "invalid JSON",
    "null",
    "[]",
    "1",
    '{"type":"unknown"}',
    '{"type":"rollCannon","turnId":4}',
    JSON.stringify({ type: "rollCannon", turnId: "x".repeat(65) }),
    "x".repeat(1025),
  ])("rejects malformed input without mutation or close: %s", (raw) => {
    const h = harness();
    h.play();
    const before = h.state();
    h.controller.onMessage("a", raw);
    expect(h.error("a")).toMatchObject({ code: "INVALID_MESSAGE" });
    expect(h.state()).toEqual(before);
    expect(h.closed).toEqual([]);
  });

  it("rejects binary input rather than attempting to trust it", () => {
    const h = harness();
    h.play();
    h.controller.onMessage("a", new Uint8Array([1, 2]));
    expect(h.error("a")).toMatchObject({ code: "INVALID_MESSAGE" });
  });

  it("rejects the wrong seat, wrong step, wrong phase, and stale token", () => {
    const h = harness();
    h.play();
    const token = h.state().match!.turnId;
    h.send("b", { type: "rollCannon", turnId: token });
    expect(h.error("b")).toMatchObject({ code: "NOT_YOUR_TURN" });
    h.send("a", { type: "rollPower", turnId: token });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
    h.send("a", { type: "rollCannon", turnId: "old" });
    expect(h.error("a")).toMatchObject({ code: "STALE_ACTION" });
    h.send("a", { type: "ready" });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
    h.send("a", { type: "rematch" });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
  });

  it("rejects rolling in lobby and countdown", () => {
    const h = harness();
    h.pair();
    h.send("a", { type: "rollCannon", turnId: "anything" });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
    h.send("a", { type: "ready" });
    h.send("b", { type: "ready" });
    h.send("a", { type: "rollCannon", turnId: h.state().match!.turnId });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
  });

  it("ignores injected identity and outcomes and accepts a turn at most once", () => {
    const h = harness({ dice: [2, 3] });
    h.play();
    const token = h.state().match!.turnId;
    h.send("a", {
      type: "rollCannon",
      turnId: token,
      playerId: "b-identity",
      dice: [6, 6],
      damage: 36,
      hp: 0,
    });
    expect(h.state().lastEvent).toMatchObject({
      type: "cannon",
      actor: 1,
      dice: [2, 3],
      damage: 6,
      eventId: 1,
    });
    const count = h.sent.length;
    h.send("a", { type: "rollCannon", turnId: token });
    expect(h.error("a")).toMatchObject({ code: "STALE_ACTION" });
    expect(h.sent).toHaveLength(count + 1);
    h.send("a", { type: "rollCannon", turnId: h.state().match!.turnId });
    expect(h.error("a")).toMatchObject({ code: "INVALID_PHASE" });
  });

  it.each(["timer", "click"])(
    "processes a deadline race exactly once when %s arrives first",
    (first) => {
      const h = harness();
      h.play();
      const token = h.state().match!.turnId;
      const deadline = h.scheduler.history.get(h.scheduler.next)!;
      if (first === "timer") {
        h.scheduler.advance(STEP_MS);
        h.send("a", { type: "rollCannon", turnId: token });
        expect(h.error("a")).toMatchObject({ code: "STALE_ACTION" });
        expect(h.state().lastEvent?.type).toBe("turnSkipped");
      } else {
        h.roll();
        const snapshot = h.state();
        deadline();
        expect(h.state()).toEqual(snapshot);
        expect(snapshot.lastEvent?.type).toBe("cannon");
      }
      expect(h.state().lastEvent?.eventId).toBe(1);
      expect(h.scheduler.maximumActive).toBe(1);
    },
  );

  it("holds cannon resolving for exactly CANNON_RESOLVE_MS, then sets a fresh step deadline", () => {
    const h = harness();
    h.play();
    h.roll();
    const start = h.scheduler.now;
    expect(h.state().match).toMatchObject({
      step: "resolving",
      turnDeadline: start + CANNON_RESOLVE_MS,
    });
    h.scheduler.advance(CANNON_RESOLVE_MS - 1);
    expect(h.state().match?.step).toBe("resolving");
    h.scheduler.advance(1);
    expect(h.state().match).toMatchObject({
      currentSeat: 2,
      step: "cannon",
      turnDeadline: start + CANNON_RESOLVE_MS + STEP_MS,
    });
  });

  it("auto power holds POWER_RESOLVE_MS then the same seat gets its cannon", () => {
    const h = harness();
    h.play();
    untilRound(h, 3);
    const token = h.state().match!.turnId;
    h.scheduler.advance(STEP_MS);
    const start = h.scheduler.now;
    expect(h.state().lastEvent).toMatchObject({ type: "power", auto: true, actor: 1 });
    h.send("a", { type: "rollPower", turnId: token });
    expect(h.error("a")).toMatchObject({ code: "STALE_ACTION" });
    h.scheduler.advance(POWER_RESOLVE_MS - 1);
    expect(h.state().match?.step).toBe("resolving");
    h.scheduler.advance(1);
    expect(h.state().match).toMatchObject({
      currentSeat: 1,
      step: "cannon",
      turnDeadline: start + POWER_RESOLVE_MS + STEP_MS,
    });
  });

  it("guards an old power resolving callback even when the cannon resolving token is identical", () => {
    const h = harness();
    h.play();
    untilRound(h, 3);
    h.roll();
    expect(h.state().lastEvent).toMatchObject({ type: "power", auto: false });
    const oldToken = h.state().match!.turnId,
      oldCallback = h.scheduler.history.get(h.scheduler.next)!;
    h.scheduler.advance(POWER_RESOLVE_MS);
    h.roll();
    expect(h.state().match!.turnId).toBe(oldToken);
    const count = h.sent.length;
    oldCallback();
    expect(h.sent).toHaveLength(count);
    expect(h.state().match?.step).toBe("resolving");
    h.scheduler.advance(CANNON_RESOLVE_MS);
    expect(h.state().match?.currentSeat).toBe(2);
  });

  it("a reconnect does not replay or re-number the last event or extend the deadline", () => {
    const h = harness();
    h.play();
    h.roll();
    h.scheduler.advance(1000);
    const before = h.state();
    h.connect("a2", "a-identity");
    expect(h.state().lastEvent).toEqual(before.lastEvent);
    expect(h.state().match?.turnDeadline).toBe(before.match?.turnDeadline);
    expect(h.state().version).toBeGreaterThan(before.version);
    h.scheduler.advance(CANNON_RESOLVE_MS - 1000);
    expect(h.state().match?.currentSeat).toBe(2);
  });
});

describe("results and rematches", () => {
  it("shows the final KO shot in resolving before publishing finished", () => {
    const h = harness({ dice: [6, 6, 1, 1, 6, 6] });
    h.play();
    h.roll();
    h.scheduler.advance(CANNON_RESOLVE_MS);
    h.roll();
    h.scheduler.advance(CANNON_RESOLVE_MS);
    h.roll();
    expect(h.state()).toMatchObject({ phase: "playing", result: null });
    expect(h.state().match?.towers[2].hp).toBe(0);
    h.scheduler.advance(CANNON_RESOLVE_MS - 1);
    expect(h.state().phase).toBe("playing");
    h.scheduler.advance(1);
    expect(h.state()).toMatchObject({ phase: "finished", result: { winner: 1, reason: "ko" } });
    expect(h.scheduler.active.size).toBe(0);
  });

  it("ends after the second seat's round-8 skip with no resolving window", () => {
    const h = harness();
    h.play();
    finishByTimeout(h);
    expect(h.state().result).toEqual({ winner: "tie", reason: "rounds" });
    expect(h.state().match).toMatchObject({ round: 8, currentSeat: 2 });
    expect(h.state().lastEvent?.type).toBe("turnSkipped");
    expect(h.scheduler.active.size).toBe(0);
  });

  it("chooses the higher HP at round 8 when the final cannon fires", () => {
    const h = harness();
    h.play();
    untilRound(h, 8);
    h.scheduler.advance(STEP_MS);
    expect(h.state().match?.currentSeat).toBe(2);
    h.roll();
    h.scheduler.advance(CANNON_RESOLVE_MS);
    expect(h.state().result).toEqual({ winner: 2, reason: "rounds" });
  });

  it("publishes votes once, alternates first seat, resets towers and advances counters across rematches", () => {
    const h = harness();
    h.play();
    finishByTimeout(h);
    const eventId = h.state().lastEvent!.eventId,
      version = h.state().version;
    h.send("a", { type: "rematch" });
    const count = h.sent.length;
    expect(h.state().rematchVotes).toEqual([1]);
    h.send("a", { type: "rematch" });
    expect(h.sent).toHaveLength(count);
    h.send("b", { type: "rematch" });
    expect(h.state()).toMatchObject({
      phase: "countdown",
      rematchVotes: [],
      lastEvent: null,
      result: null,
    });
    expect(h.state().match).toMatchObject({
      number: 2,
      firstSeat: 2,
      currentSeat: 2,
      round: 1,
      towerSeed: 123,
    });
    expect(h.state().version).toBeGreaterThan(version);
    expect(h.state().match?.towers[1].hp).toBe(50);
    expect(h.state().match?.towers[2].hp).toBe(50);
    h.scheduler.advance(COUNTDOWN_MS);
    h.roll();
    expect(h.state().lastEvent!.eventId).toBe(eventId + 1);
    h.scheduler.advance(CANNON_RESOLVE_MS);
    finishByTimeout(h);
    h.send("b", { type: "rematch" });
    h.send("a", { type: "rematch" });
    expect(h.state().match).toMatchObject({ number: 3, firstSeat: 1 });
  });

  it("retains state while everyone is disconnected without Leave", () => {
    const h = harness();
    h.pair();
    h.controller.onClose("a");
    h.controller.onClose("b");
    expect(h.scheduler.active.size).toBe(0);
    h.scheduler.advance(65_000);
    h.connect("a2", "a-identity");
    expect(h.state().players[2]?.connected).toBe(false);
    expect(h.state().players[1]?.name).toBe("a");
  });

  it.each([1, 2] as Seat[])(
    "last Leave of seat %i after a running match permits code reuse",
    (seat) => {
      const h = harness();
      h.play();
      const id = seat === 1 ? "a" : "b",
        other = seat === 1 ? "b" : "a";
      h.send(other, { type: "leave" });
      h.send(id, { type: "leave" });
      h.connect("c", "c-identity", "create");
      expect(h.state().phase).toBe("lobby");
      expect(h.scheduler.active.size).toBe(0);
    },
  );
});
