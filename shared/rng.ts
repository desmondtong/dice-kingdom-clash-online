/**
 * Server randomness on `crypto.getRandomValues` (works in browsers, Node and Workers).
 *
 * Contract (define-game-contracts): signatures are frozen. `build-game-server` replaces the
 * bodies (DEC-6). The mapping functions take a `RandomSource` so their distributions can be
 * unit-tested with fixed inputs.
 */
import { DIE_FACES, HEAL_MAX, HEAL_MIN, POWERS } from "./constants.ts";
import type { Power, RandomSource, Rng } from "./types.ts";

/** A uniform number in [0, 1) from `crypto.getRandomValues`. */
export function cryptoRandom(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return value / 0x1_0000_0000;
}

/** 1..DIE_FACES, uniform. */
export function rollDie(random: RandomSource): number {
  return Math.floor(random() * DIE_FACES) + 1;
}

/** One of POWERS, uniform. */
export function pickPower(random: RandomSource): Power {
  return POWERS[Math.floor(random() * POWERS.length)]!;
}

/** max(ceil(random() × HEAL_MAX), HEAL_MIN), with random() = 0 mapped to 1 (D12). */
export function healAmount(random: RandomSource): number {
  const rolled = Math.max(1, Math.ceil(random() * HEAL_MAX));
  return Math.max(rolled, HEAL_MIN);
}

/** A non-negative 32-bit integer for `MatchState.towerSeed`. */
export function randomTowerSeed(random: RandomSource): number {
  return Math.floor(random() * 0x1_0000_0000);
}

/** The server's `Rng`, built from the functions above on `cryptoRandom`. */
export function createCryptoRng(): Rng {
  return {
    rollDie: () => rollDie(cryptoRandom),
    pickPower: () => pickPower(cryptoRandom),
    healAmount: () => healAmount(cryptoRandom),
  };
}
