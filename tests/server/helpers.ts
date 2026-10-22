import { expect } from "vitest";
import {
  DIE_FACES,
  ERROR_CODES,
  HEAL_MAX,
  HEAL_MIN,
  MAX_HP,
  PHASES,
  POWER_ROUNDS,
  POWERS,
  RESULT_REASONS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROUNDS,
  SEATS,
  STEPS,
} from "../../shared/constants.ts";
import { makeTurnId, opponent, sanitizeName } from "../../shared/protocol.ts";
import type { GameEvent, Power, RoomState, Seat, ServerMessage } from "../../shared/types.ts";
import { RoomController } from "../../party/room.ts";
import type { Scheduler } from "../../party/room.ts";

/** The frozen fixture test helpers are not exported; assert the same formulas here. */
export function assertEvent(event: GameEvent): void {
  expect(Number.isInteger(event.eventId) && event.eventId > 0).toBe(true);
  expect(SEATS).toContain(event.actor);
  if (event.type === "cannon") {
    expect(event.dice).toHaveLength(2);
    for (const face of event.dice)
      expect(Number.isInteger(face) && face >= 1 && face <= DIE_FACES).toBe(true);
    expect(event.rawDamage).toBe(event.dice[0] * event.dice[1]);
    expect(event.target).toBe(event.reflected ? event.actor : opponent(event.actor));
    expect(event.damage).toBe(event.shielded ? Math.ceil(event.rawDamage / 2) : event.rawDamage);
  } else if (event.type === "power") {
    expect(POWERS).toContain(event.power);
    expect(typeof event.auto).toBe("boolean");
    if (event.power === "heal") {
      expect(event.healAmount).toBeGreaterThanOrEqual(HEAL_MIN);
      expect(event.healAmount).toBeLessThanOrEqual(HEAL_MAX);
    } else expect(event.healAmount).toBeUndefined();
  } else expect(event.type).toBe("turnSkipped");
}

export function assertState(state: RoomState): void {
  expect(state.code).toHaveLength(ROOM_CODE_LENGTH);
  expect([...state.code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
  expect(Number.isInteger(state.version) && state.version > 0).toBe(true);
  expect(Number.isInteger(state.serverNow)).toBe(true);
  expect(PHASES).toContain(state.phase);
  const seats = SEATS.filter((seat) => state.players[seat] !== undefined);
  expect(seats).toContain(state.hostSeat);
  for (const seat of seats) {
    const player = state.players[seat]!;
    expect(sanitizeName(player.name, seat)).toBe(player.name);
    expect(typeof player.connected).toBe("boolean");
    expect(typeof player.ready).toBe("boolean");
  }
  expect(state.match === null).toBe(state.phase === "lobby");
  expect(state.countdownEndsAt !== null).toBe(state.phase === "countdown");
  expect(state.result !== null).toBe(state.phase === "finished");
  if (state.countdownEndsAt !== null)
    expect(state.countdownEndsAt).toBeGreaterThan(state.serverNow);
  if (state.phase === "countdown" || state.phase === "playing") {
    expect(seats).toEqual([1, 2]);
    expect(seats.every((seat) => state.players[seat]!.ready)).toBe(true);
  }
  if (state.phase === "finished")
    expect(seats.some((seat) => state.players[seat]!.ready)).toBe(false);
  if (state.phase !== "finished") expect(state.rematchVotes).toEqual([]);
  for (const vote of state.rematchVotes) expect(seats).toContain(vote);
  expect(new Set(state.rematchVotes).size).toBe(state.rematchVotes.length);
  const match = state.match;
  if (match !== null) {
    expect(Number.isInteger(match.number) && match.number >= 1).toBe(true);
    expect(Number.isInteger(match.round) && match.round >= 1 && match.round <= ROUNDS).toBe(true);
    expect(SEATS).toContain(match.firstSeat);
    expect(SEATS).toContain(match.currentSeat);
    expect(STEPS).toContain(match.step);
    expect(match.turnId).toBe(makeTurnId(match.number, match.round, match.currentSeat, match.step));
    if (match.step === "power") expect(POWER_ROUNDS).toContain(match.round);
    expect(
      Number.isInteger(match.towerSeed) && match.towerSeed >= 0 && match.towerSeed <= 0xffffffff,
    ).toBe(true);
    for (const seat of SEATS) {
      const tower = match.towers[seat];
      expect(Number.isInteger(tower.hp) && tower.hp >= 0 && tower.hp <= MAX_HP).toBe(true);
      expect(typeof tower.shield).toBe("boolean");
      expect(typeof tower.reflectNextAttack).toBe("boolean");
      // Realtime-sync explicitly permits 0 HP while animating a KO, unlike the sample fixtures.
      if (state.phase === "playing" && match.step !== "resolving")
        expect(tower.hp).toBeGreaterThan(0);
    }
    if (state.phase === "playing") expect(match.turnDeadline).toBeGreaterThan(state.serverNow);
    if (match.step === "resolving") {
      expect(state.lastEvent).not.toBeNull();
      expect(state.lastEvent?.actor).toBe(match.currentSeat);
      expect(state.lastEvent?.type).not.toBe("turnSkipped");
      if (state.lastEvent?.type === "power") expect(POWER_ROUNDS).toContain(match.round);
    }
    if (state.result !== null) {
      const result = state.result;
      expect(RESULT_REASONS).toContain(result.reason);
      if (result.reason === "ko") {
        expect(result.winner).not.toBe("tie");
        expect(match.towers[opponent(result.winner as Seat)].hp).toBe(0);
        expect(match.towers[result.winner as Seat].hp).toBeGreaterThan(0);
      } else if (result.reason === "rounds") {
        expect(match.round).toBe(ROUNDS);
        expect(match.currentSeat).toBe(opponent(match.firstSeat));
        const a = match.towers[1].hp,
          b = match.towers[2].hp;
        expect(result.winner).toBe(a === b ? "tie" : a > b ? 1 : 2);
      } else expect(seats).toEqual([result.winner]);
    }
  }
  if (state.lastEvent !== null) assertEvent(state.lastEvent);
}

export function assertServerMessage(input: unknown): asserts input is ServerMessage {
  const json = JSON.stringify(input);
  expect(JSON.parse(json)).toEqual(input);
  const keys: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      collect(item);
    }
  };
  collect(input);
  expect(keys).not.toContain("playerId");
  const message = input as ServerMessage;
  expect(["welcome", "state", "error"]).toContain(message.type);
  if (message.type === "state") assertState(message.state);
  else if (message.type === "welcome") {
    expect(SEATS).toContain(message.seat);
    expect(message.code).toHaveLength(ROOM_CODE_LENGTH);
  } else {
    expect(ERROR_CODES).toContain(message.code);
    expect(typeof message.message).toBe("string");
  }
}

export class FakeScheduler implements Scheduler {
  now = 1_800_000_000_000;
  next = 0;
  active = new Map<number, { at: number; callback: () => void }>();
  history = new Map<number, () => void>();
  maximumActive = 0;
  set(ms: number, callback: () => void): number {
    const id = ++this.next;
    this.active.set(id, { at: this.now + ms, callback });
    this.history.set(id, callback);
    this.maximumActive = Math.max(this.maximumActive, this.active.size);
    expect(this.active.size).toBeLessThanOrEqual(1);
    return id;
  }
  clear(handle: unknown): void {
    this.active.delete(handle as number);
  }
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const entry = [...this.active.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (entry === undefined || entry[1].at > target) break;
      this.now = entry[1].at;
      this.active.delete(entry[0]);
      entry[1].callback();
    }
    this.now = target;
  }
}

export function harness(options: { dice?: number[]; power?: Power } = {}) {
  const scheduler = new FakeScheduler();
  const sent: { id: string; message: ServerMessage }[] = [];
  const closed: { id: string; code: number; reason: string }[] = [];
  const versions = new Map<string, number>();
  const dice = [...(options.dice ?? [])];
  const controller = new RoomController("KX7P", {
    transport: {
      send: (id, message) => {
        assertServerMessage(message);
        if (message.type === "state") {
          expect(message.state.version).toBeGreaterThan(versions.get(id) ?? 0);
          versions.set(id, message.state.version);
        }
        sent.push({ id, message: structuredClone(message) });
      },
      close: (id, code, reason) => {
        closed.push({ id, code, reason });
      },
    },
    clock: { now: () => scheduler.now },
    scheduler,
    rng: {
      rollDie: () => dice.shift() ?? 1,
      pickPower: () => options.power ?? "shield",
      healAmount: () => 10,
    },
    towerSeed: () => 123,
  });
  const connect = (id: string, playerId = `${id}-identity`, intent = "join", name = id): void => {
    const url = new URL("http://localhost:1999/parties/main/KX7P");
    url.searchParams.set("playerId", playerId);
    url.searchParams.set("intent", intent);
    url.searchParams.set("name", name);
    controller.onConnect(id, url);
  };
  const send = (id: string, message: unknown): void =>
    controller.onMessage(id, JSON.stringify(message));
  const state = (id?: string): RoomState => {
    const messages = sent.filter(
      (entry) => (id === undefined || entry.id === id) && entry.message.type === "state",
    );
    return (messages.at(-1)!.message as Extract<ServerMessage, { type: "state" }>).state;
  };
  const error = (id: string) =>
    sent.filter((entry) => entry.id === id && entry.message.type === "error").at(-1)?.message;
  const pair = (): void => {
    connect("a", "a-identity", "create");
    connect("b");
  };
  const play = (): void => {
    pair();
    send("a", { type: "ready" });
    send("b", { type: "ready" });
    scheduler.advance(3000);
  };
  const roll = (): void => {
    const match = state().match!;
    send(match.currentSeat === 1 ? "a" : "b", {
      type: match.step === "power" ? "rollPower" : "rollCannon",
      turnId: match.turnId,
    });
  };
  return { controller, scheduler, sent, closed, connect, send, state, error, pair, play, roll };
}
