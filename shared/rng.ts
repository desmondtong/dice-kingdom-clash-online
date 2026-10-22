/**
 * Server randomness on `crypto.getRandomValues` (works in browsers, Node and Workers).
 *
 * Contract (define-game-contracts): signatures are frozen. `build-game-server` replaces the
 * bodies (DEC-6). The mapping functions take a `RandomSource` so their distributions can be
 * unit-tested with fixed inputs.
 */
import { NotImplementedError } from "./errors.ts";
import type { Power, RandomSource, Rng } from "./types.ts";

/** A uniform number in [0, 1) from `crypto.getRandomValues`. */
export function cryptoRandom(): number {
  throw new NotImplementedError("cryptoRandom");
}

/** 1..DIE_FACES, uniform. */
export function rollDie(random: RandomSource): number {
  void random;
  throw new NotImplementedError("rollDie");
}

/** One of POWERS, uniform. */
export function pickPower(random: RandomSource): Power {
  void random;
  throw new NotImplementedError("pickPower");
}

/** max(ceil(random() × HEAL_MAX), HEAL_MIN), with random() = 0 mapped to 1 (D12). */
export function healAmount(random: RandomSource): number {
  void random;
  throw new NotImplementedError("healAmount");
}

/** A non-negative 32-bit integer for `MatchState.towerSeed`. */
export function randomTowerSeed(random: RandomSource): number {
  void random;
  throw new NotImplementedError("randomTowerSeed");
}

/** The server's `Rng`, built from the functions above on `cryptoRandom`. */
export function createCryptoRng(): Rng {
  throw new NotImplementedError("createCryptoRng");
}
