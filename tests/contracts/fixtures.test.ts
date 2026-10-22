import { describe, expect, it } from "vitest";
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
import { fixtures, sampleErrors, sampleWelcome } from "../../shared/fixtures/index.ts";
import { makeTurnId, opponent, sanitizeName } from "../../shared/protocol.ts";
import type { RoomState, Seat } from "../../shared/types.ts";

const entries = Object.entries(fixtures) as [string, RoomState][];

function filledSeats(state: RoomState): Seat[] {
  return SEATS.filter((seat) => state.players[seat] !== undefined);
}

/** Collects every object key in a value, at any depth. */
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, keys));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      allKeys(v, keys);
    }
  }
  return keys;
}

describe.each(entries)("fixture %s", (_name, state) => {
  const seats = filledSeats(state);

  it("has a valid room code, version and clock", () => {
    expect(state.code).toHaveLength(ROOM_CODE_LENGTH);
    expect([...state.code].every((c) => ROOM_CODE_ALPHABET.includes(c))).toBe(true);
    expect(Number.isInteger(state.version) && state.version > 0).toBe(true);
    expect(Number.isInteger(state.serverNow)).toBe(true);
  });

  it("contains no playerId anywhere (DEC-1a)", () => {
    const keys = allKeys(state);
    expect(keys.has("playerId")).toBe(false);
    expect(JSON.stringify(state)).not.toMatch(/playerId/i);
  });

  it("has a filled host seat and sanitised names", () => {
    expect(seats).toContain(state.hostSeat);
    for (const seat of seats) {
      const name = state.players[seat]?.name ?? "";
      expect(sanitizeName(name, seat)).toBe(name);
    }
  });

  it("sets match, countdownEndsAt and result only in the right phases", () => {
    expect(state.match === null).toBe(state.phase === "lobby");
    expect(state.countdownEndsAt !== null).toBe(state.phase === "countdown");
    expect(state.result !== null).toBe(state.phase === "finished");
    if (state.countdownEndsAt !== null)
      expect(state.countdownEndsAt).toBeGreaterThan(state.serverNow);
  });

  it("has ready and rematch flags that match the phase (DEC-5)", () => {
    const ready = seats.map((seat) => state.players[seat]?.ready);
    if (state.phase === "countdown" || state.phase === "playing") {
      expect(seats).toEqual([1, 2]);
      expect(ready.every(Boolean)).toBe(true);
    }
    if (state.phase === "finished") expect(ready.some(Boolean)).toBe(false);
    if (state.phase !== "finished") expect(state.rematchVotes).toEqual([]);
    for (const vote of state.rematchVotes) expect(seats).toContain(vote);
    expect(new Set(state.rematchVotes).size).toBe(state.rematchVotes.length);
  });

  it("has a consistent match", () => {
    const m = state.match;
    if (m === null) return;
    expect(Number.isInteger(m.number) && m.number >= 1).toBe(true);
    expect(m.round).toBeGreaterThanOrEqual(1);
    expect(m.round).toBeLessThanOrEqual(ROUNDS);
    expect(m.turnId).toBe(makeTurnId(m.number, m.round, m.currentSeat, m.step));
    if (m.step === "power") expect(POWER_ROUNDS).toContain(m.round);
    for (const seat of SEATS) {
      const hp = m.towers[seat].hp;
      expect(Number.isInteger(hp) && hp >= 0 && hp <= MAX_HP).toBe(true);
    }
    if (state.phase === "playing") {
      expect(m.towers[1].hp).toBeGreaterThan(0);
      expect(m.towers[2].hp).toBeGreaterThan(0);
      expect(m.turnDeadline).toBeGreaterThan(state.serverNow);
    }
  });

  it("has a lastEvent that matches the step and the rules", () => {
    const m = state.match;
    const e = state.lastEvent;
    if (m?.step === "resolving") {
      expect(e).not.toBeNull();
      expect(e?.actor).toBe(m.currentSeat);
      expect(e?.type).not.toBe("turnSkipped");
      if (e?.type === "power") expect(POWER_ROUNDS).toContain(m.round);
    }
    if (e === null) return;
    expect(Number.isInteger(e.eventId) && e.eventId >= 1).toBe(true);
    if (e.type === "cannon") {
      const [a, b] = e.dice;
      expect(a >= 1 && a <= DIE_FACES && b >= 1 && b <= DIE_FACES).toBe(true);
      expect(e.rawDamage).toBe(a * b);
      expect(e.target).toBe(e.reflected ? e.actor : opponent(e.actor));
      expect(e.damage).toBe(e.shielded ? Math.ceil(e.rawDamage / 2) : e.rawDamage);
    }
    if (e.type === "power") {
      expect(POWERS).toContain(e.power);
      if (e.power === "heal") {
        expect(e.healAmount).toBeGreaterThanOrEqual(HEAL_MIN);
        expect(e.healAmount).toBeLessThanOrEqual(HEAL_MAX);
      } else {
        expect(e.healAmount).toBeUndefined();
      }
    }
  });

  it("has a result that matches the towers", () => {
    const r = state.result;
    const m = state.match;
    if (r === null || m === null) return;
    const [hp1, hp2] = [m.towers[1].hp, m.towers[2].hp];
    if (r.reason === "ko") {
      expect(r.winner).not.toBe("tie");
      const loser = opponent(r.winner as Seat);
      expect(m.towers[loser].hp).toBe(0);
      expect(m.towers[r.winner as Seat].hp).toBeGreaterThan(0);
    }
    if (r.reason === "rounds") {
      expect(m.round).toBe(ROUNDS);
      expect(m.currentSeat).toBe(opponent(m.firstSeat));
      expect(r.winner).toBe(hp1 === hp2 ? "tie" : hp1 > hp2 ? 1 : 2);
    }
    if (r.reason === "left") {
      expect(r.winner).not.toBe("tie");
      expect(seats).toEqual([r.winner]);
    }
  });
});

describe("fixture coverage", () => {
  const states = entries.map(([, s]) => s);

  it("covers every phase, step, event type, power and result reason", () => {
    expect(new Set(states.map((s) => s.phase))).toEqual(new Set(PHASES));
    expect(new Set(states.flatMap((s) => (s.match ? [s.match.step] : [])))).toEqual(new Set(STEPS));
    expect(new Set(states.flatMap((s) => (s.lastEvent ? [s.lastEvent.type] : [])))).toEqual(
      new Set(["cannon", "power", "turnSkipped"]),
    );
    const powers = states.flatMap((s) =>
      s.lastEvent?.type === "power" ? [s.lastEvent.power] : [],
    );
    expect(new Set(powers)).toEqual(new Set(POWERS));
    expect(new Set(states.flatMap((s) => (s.result ? [s.result.reason] : [])))).toEqual(
      new Set(RESULT_REASONS),
    );
    expect(states.some((s) => s.result?.winner === "tie")).toBe(true);
    expect(states.some((s) => Object.values(s.players).some((p) => !p.connected))).toBe(true);
  });

  it("has a welcome sample for each seat and an error sample for each code", () => {
    expect(sampleWelcome[1].seat).toBe(1);
    expect(sampleWelcome[2].seat).toBe(2);
    expect(Object.keys(sampleErrors).sort()).toEqual([...ERROR_CODES].sort());
    for (const [code, msg] of Object.entries(sampleErrors)) expect(msg.code).toBe(code);
  });

  it("round-trips through JSON unchanged (no undefined, Map or Date values)", () => {
    for (const state of states) expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
