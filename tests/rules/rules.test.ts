import { describe, expect, it } from "vitest";
import { MAX_HP, POWER_ROUNDS, ROUNDS } from "../../shared/constants.ts";
import { opponent, makeTurnId } from "../../shared/protocol.ts";
import {
  advanceTurn,
  applyCannon,
  applyPower,
  checkResult,
  skipTurn,
  startMatch,
} from "../../shared/rules.ts";
import type {
  CannonEvent,
  MatchState,
  Power,
  PowerEvent,
  Rng,
  Seat,
  Step,
  TowerState,
} from "../../shared/types.ts";

function tower(hp = MAX_HP, status: Partial<Omit<TowerState, "hp">> = {}): TowerState {
  return { hp, shield: false, reflectNextAttack: false, ...status };
}

function matchAt(
  fields: {
    number?: number;
    firstSeat?: Seat;
    round?: number;
    currentSeat?: Seat;
    step?: Step;
    towers?: MatchState["towers"];
  } = {},
): MatchState {
  const number = fields.number ?? 1;
  const firstSeat = fields.firstSeat ?? 1;
  const round = fields.round ?? 1;
  const currentSeat = fields.currentSeat ?? firstSeat;
  const step = fields.step ?? "cannon";

  return {
    number,
    firstSeat,
    round,
    currentSeat,
    step,
    turnId: makeTurnId(number, round, currentSeat, step),
    turnDeadline: 5_000,
    towers: fields.towers ?? { 1: tower(), 2: tower() },
    towerSeed: 123_456,
  };
}

function take<T>(values: T[], label: string): T {
  const value = values.shift();
  if (value === undefined) throw new Error(`No scripted ${label} remains`);
  return value;
}

function scriptedRng(input: { dice?: number[]; powers?: Power[]; heals?: number[] } = {}): Rng {
  const dice = [...(input.dice ?? [])];
  const powers = [...(input.powers ?? [])];
  const heals = [...(input.heals ?? [])];

  return {
    rollDie: () => take(dice, "die"),
    pickPower: () => take(powers, "power"),
    healAmount: () => take(heals, "heal"),
  };
}

function expectCannonConsistency(event: Omit<CannonEvent, "eventId">): void {
  expect(event.dice[0]).toBeGreaterThanOrEqual(1);
  expect(event.dice[0]).toBeLessThanOrEqual(6);
  expect(event.dice[1]).toBeGreaterThanOrEqual(1);
  expect(event.dice[1]).toBeLessThanOrEqual(6);
  expect(event.rawDamage).toBe(event.dice[0] * event.dice[1]);
  expect(event.target).toBe(event.reflected ? event.actor : opponent(event.actor));
  expect(event.damage).toBe(event.shielded ? Math.ceil(event.rawDamage / 2) : event.rawDamage);
}

function expectPowerConsistency(event: Omit<PowerEvent, "eventId">): void {
  if (event.power === "heal") {
    expect(event.healAmount).toBeGreaterThanOrEqual(10);
    expect(event.healAmount).toBeLessThanOrEqual(20);
  } else {
    expect(event.healAmount).toBeUndefined();
  }
}

describe("startMatch", () => {
  it("creates independent, full-health towers for the requested first seat", () => {
    const match = startMatch({ number: 3, firstSeat: 2, towerSeed: 987 });

    expect(match).toEqual({
      number: 3,
      firstSeat: 2,
      round: 1,
      currentSeat: 2,
      step: "cannon",
      turnId: makeTurnId(3, 1, 2, "cannon"),
      turnDeadline: 0,
      towers: { 1: tower(), 2: tower() },
      towerSeed: 987,
    });
    expect(match.towers[1]).not.toBe(match.towers[2]);
  });
});

describe("applyPower", () => {
  it("applies Shield and Ricochet to their proper owners", () => {
    const powerStep = matchAt({ round: 3, currentSeat: 1, step: "power" });
    const shield = applyPower(powerStep, scriptedRng({ powers: ["shield"] }), { auto: false });
    const ricochet = applyPower(powerStep, scriptedRng({ powers: ["ricochet"] }), { auto: true });

    expect(shield.match.towers[1].shield).toBe(true);
    expect(shield.match.towers[2].reflectNextAttack).toBe(false);
    expect(shield.event).toEqual({ type: "power", actor: 1, power: "shield", auto: false });
    expect(ricochet.match.towers[1].reflectNextAttack).toBe(false);
    expect(ricochet.match.towers[2].reflectNextAttack).toBe(true);
    expect(ricochet.event).toEqual({ type: "power", actor: 1, power: "ricochet", auto: true });
    expect(shield.match.step).toBe("resolving");
    expect(shield.match.turnId).toBe(makeTurnId(1, 3, 1, "resolving"));
    expectPowerConsistency(shield.event);
    expectPowerConsistency(ricochet.event);
  });

  it("heals only to MAX_HP, exposes the pre-cap amount, and leaves the input unchanged", () => {
    const input = matchAt({
      round: 3,
      currentSeat: 1,
      step: "power",
      towers: { 1: tower(45), 2: tower(31) },
    });
    const before = structuredClone(input);
    const result = applyPower(input, scriptedRng({ powers: ["heal"], heals: [15] }), {
      auto: false,
    });

    expect(result.match.towers[1].hp).toBe(MAX_HP);
    expect(result.event).toEqual({
      type: "power",
      actor: 1,
      power: "heal",
      healAmount: 15,
      auto: false,
    });
    expect(result.match).not.toBe(input);
    expect(result.match.towers[1]).not.toBe(input.towers[1]);
    expect(input).toEqual(before);
    expectPowerConsistency(result.event);
  });

  it("swaps HP only, retaining all Shield and Ricochet statuses", () => {
    const input = matchAt({
      round: 6,
      currentSeat: 2,
      step: "power",
      towers: {
        1: tower(13, { shield: true, reflectNextAttack: true }),
        2: tower(41, { shield: false, reflectNextAttack: true }),
      },
    });
    const result = applyPower(input, scriptedRng({ powers: ["swap"] }), { auto: false });

    expect(result.match.towers).toEqual({
      1: tower(41, { shield: true, reflectNextAttack: true }),
      2: tower(13, { shield: false, reflectNextAttack: true }),
    });
    expect(result.event).toEqual({ type: "power", actor: 2, power: "swap", auto: false });
    expectPowerConsistency(result.event);
  });
});

describe("applyCannon", () => {
  it("resolves Ricochet before Shield, including rounded-up reflected damage", () => {
    const input = matchAt({
      currentSeat: 1,
      towers: { 1: tower(20, { shield: true, reflectNextAttack: true }), 2: tower(44) },
    });
    const before = structuredClone(input);
    const result = applyCannon(input, scriptedRng({ dice: [5, 5] }));

    expect(result.event).toEqual({
      type: "cannon",
      actor: 1,
      dice: [5, 5],
      rawDamage: 25,
      target: 1,
      reflected: true,
      shielded: true,
      damage: 13,
    });
    expect(result.match.towers).toEqual({ 1: tower(7), 2: tower(44) });
    expect(result.match.step).toBe("resolving");
    expect(result.match.turnId).toBe(makeTurnId(1, 1, 1, "resolving"));
    expect(result.match).not.toBe(input);
    expect(result.match.towers[2]).not.toBe(input.towers[2]);
    expect(input).toEqual(before);
    expectCannonConsistency(result.event);
  });

  it("targets the opponent and consumes their Shield after applying ceiling division", () => {
    const input = matchAt({
      currentSeat: 1,
      towers: { 1: tower(50), 2: tower(10, { shield: true }) },
    });
    const result = applyCannon(input, scriptedRng({ dice: [1, 3] }));

    expect(result.event).toEqual({
      type: "cannon",
      actor: 1,
      dice: [1, 3],
      rawDamage: 3,
      target: 2,
      reflected: false,
      shielded: true,
      damage: 2,
    });
    expect(result.match.towers[2]).toEqual(tower(8));
    expectCannonConsistency(result.event);
  });
});

describe("skipTurn", () => {
  it("produces a skip event without consuming the actor's Ricochet", () => {
    const input = matchAt({
      currentSeat: 2,
      towers: { 1: tower(30), 2: tower(30, { reflectNextAttack: true }) },
    });
    const before = structuredClone(input);
    const result = skipTurn(input);

    expect(result.event).toEqual({ type: "turnSkipped", actor: 2 });
    expect(result.match.towers[2].reflectNextAttack).toBe(true);
    expect(result.match).not.toBe(input);
    expect(input).toEqual(before);
  });
});

describe("checkResult", () => {
  it("ends immediately when either tower is knocked out, including self-KO by Ricochet", () => {
    const selfKo = matchAt({
      firstSeat: 2,
      currentSeat: 2,
      step: "resolving",
      towers: { 1: tower(19), 2: tower(0) },
    });
    const opponentKo = matchAt({
      currentSeat: 1,
      step: "resolving",
      towers: { 1: tower(4), 2: tower(0) },
    });

    expect(checkResult(selfKo, "power")).toEqual({ winner: 1, reason: "ko" });
    expect(checkResult(selfKo, "cannon")).toEqual({ winner: 1, reason: "ko" });
    expect(checkResult(opponentKo, "cannon")).toEqual({ winner: 1, reason: "ko" });
  });

  it("only checks the round-eight score after the second seat finishes its cannon", () => {
    const finalTurn = matchAt({
      firstSeat: 2,
      round: ROUNDS,
      currentSeat: 1,
      step: "resolving",
      towers: { 1: tower(18), 2: tower(26) },
    });
    const tie = matchAt({
      firstSeat: 2,
      round: ROUNDS,
      currentSeat: 1,
      step: "resolving",
      towers: { 1: tower(18), 2: tower(18) },
    });

    expect(checkResult(finalTurn, "power")).toBeNull();
    expect(checkResult(finalTurn, "cannon")).toEqual({ winner: 2, reason: "rounds" });
    expect(checkResult(tie, "cannon")).toEqual({ winner: "tie", reason: "rounds" });
  });
});

describe("advanceTurn", () => {
  it("moves power to the same seat's cannon, then follows first-seat order and power rounds", () => {
    const power = matchAt({ firstSeat: 2, round: 3, currentSeat: 2, step: "resolving" });
    const powerBefore = structuredClone(power);
    const cannon = advanceTurn(power, "power");
    const nextPlayer = advanceTurn(cannon, "cannon");
    const nextRound = advanceTurn(
      matchAt({ firstSeat: 2, round: 2, currentSeat: 1, step: "resolving" }),
      "cannon",
    );

    expect(cannon).toMatchObject({ round: 3, currentSeat: 2, step: "cannon" });
    expect(cannon.towers[1]).not.toBe(power.towers[1]);
    expect(power).toEqual(powerBefore);
    expect(nextPlayer).toMatchObject({ round: 3, currentSeat: 1, step: "power" });
    expect(nextRound).toMatchObject({ round: 3, currentSeat: 2, step: "power" });
    expect(nextRound.turnId).toBe(makeTurnId(1, 3, 2, "power"));
  });
});

describe("complete match", () => {
  it("plays all eight rounds with seat 2 first, including every power step and a round-eight tie", () => {
    const rng: Rng = {
      rollDie: () => 1,
      pickPower: () => "shield",
      healAmount: () => 10,
    };
    let match = startMatch({ number: 1, firstSeat: 2, towerSeed: 7 });
    const turnOrder: string[] = [];
    const powerRounds: number[] = [];
    let result = null;

    while (result === null) {
      turnOrder.push(`${match.round}:${match.currentSeat}`);
      if (match.step === "power") {
        const power = applyPower(match, rng, { auto: false });
        expectPowerConsistency(power.event);
        powerRounds.push(match.round);
        match = advanceTurn(power.match, "power");
      }

      const cannon = applyCannon(match, rng);
      expectCannonConsistency(cannon.event);
      match = cannon.match;
      result = checkResult(cannon.match, "cannon");
      if (result === null) match = advanceTurn(match, "cannon");
    }

    expect(turnOrder).toEqual(
      Array.from({ length: ROUNDS }, (_, index) => [`${index + 1}:2`, `${index + 1}:1`]).flat(),
    );
    expect(powerRounds).toEqual(POWER_ROUNDS.flatMap((round) => [round, round]));
    expect(match.round).toBe(ROUNDS);
    expect(match.currentSeat).toBe(1);
    expect(match.towers).toEqual({ 1: tower(42), 2: tower(42) });
    expect(result).toEqual({ winner: "tie", reason: "rounds" });
  });
});
