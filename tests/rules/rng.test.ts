import { describe, expect, it } from "vitest";
import { DIE_FACES, HEAL_MAX, HEAL_MIN, POWERS } from "../../shared/constants.ts";
import {
  createCryptoRng,
  cryptoRandom,
  healAmount,
  pickPower,
  randomTowerSeed,
  rollDie,
} from "../../shared/rng.ts";

describe("cryptoRandom", () => {
  it("draws values in the half-open unit interval", () => {
    for (let index = 0; index < 128; index += 1) {
      const value = cryptoRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("rollDie", () => {
  it("maps every die bucket and both boundaries to 1 through 6", () => {
    const justBelowOne = 0.999_999_999_999_999_9;
    const inputs = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, justBelowOne];

    expect(inputs.map((value) => rollDie(() => value))).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });
});

describe("pickPower", () => {
  it("maps every power bucket and just below one to the canonical powers", () => {
    const justBelowOne = 0.999_999_999_999_999_9;
    const inputs = [0, 0.25, 0.5, 0.75, justBelowOne];

    expect(inputs.map((value) => pickPower(() => value))).toEqual([
      POWERS[0],
      POWERS[1],
      POWERS[2],
      POWERS[3],
      POWERS[3],
    ]);
  });
});

describe("healAmount", () => {
  it("returns 10 through 20 with the D12 threshold at one half", () => {
    expect(healAmount(() => 0)).toBe(HEAL_MIN);
    expect(healAmount(() => 0.5)).toBe(HEAL_MIN);
    expect(healAmount(() => 0.500_000_000_001)).toBe(11);

    for (let expected = 11; expected <= HEAL_MAX; expected += 1) {
      expect(healAmount(() => expected / HEAL_MAX)).toBe(expected);
    }

    expect(healAmount(() => 0.999_999_999_999_999_9)).toBe(HEAL_MAX);
  });
});

describe("randomTowerSeed", () => {
  it("maps source boundaries to non-negative unsigned 32-bit integers", () => {
    expect(randomTowerSeed(() => 0)).toBe(0);
    expect(randomTowerSeed(() => 0.999_999_999_999_999_9)).toBe(0xffff_ffff);
  });
});

describe("createCryptoRng", () => {
  it("exposes only values in the documented ranges over many draws", () => {
    const rng = createCryptoRng();

    for (let index = 0; index < 128; index += 1) {
      const die = rng.rollDie();
      const power = rng.pickPower();
      const heal = rng.healAmount();

      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(DIE_FACES);
      expect(POWERS).toContain(power);
      expect(heal).toBeGreaterThanOrEqual(HEAL_MIN);
      expect(heal).toBeLessThanOrEqual(HEAL_MAX);
    }
  });
});
