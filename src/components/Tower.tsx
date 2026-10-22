import { CANNON_RESOLVE_MS } from "../../shared/constants.ts";
import type { Seat, TowerState } from "../../shared/types.ts";
import StatusIcons from "./StatusIcons.tsx";

interface TowerProps {
  seat: Seat;
  name: string;
  tower: TowerState;
  towerSeed: number;
  isYou: boolean;
  isHit: boolean;
}

function cosmeticFace(towerSeed: number, seat: Seat, index: number): number {
  const source = `${towerSeed}:${seat}:${index}`;
  let hash = 2_166_136_261;

  for (let character = 0; character < source.length; character += 1) {
    hash ^= source.charCodeAt(character);
    hash = Math.imul(hash, 16_777_619);
  }

  return ((hash >>> 0) % 6) + 1;
}

export default function Tower({ seat, name, tower, towerSeed, isYou, isHit }: TowerProps) {
  const dice = Array.from({ length: tower.hp }, (_, index) => ({
    index,
    face: cosmeticFace(towerSeed, seat, index),
  }));

  return (
    <section
      className={`tower-card tower-seat-${seat}${isYou ? " is-you" : ""}${isHit ? " is-hit" : ""}`}
      aria-label={`${name}'s tower`}
    >
      <header className="tower-heading">
        <div>
          <h2>{name}</h2>
          {isYou ? <span className="you-marker">You</span> : null}
        </div>
        <output
          className="tower-hp"
          data-testid={`tower-${seat}-hp`}
          aria-label={`${name} hit points`}
        >
          {tower.hp} HP
        </output>
      </header>
      <StatusIcons tower={tower} seat={seat} />
      <div
        className="tower-grid"
        data-testid={`tower-${seat}`}
        data-seat={seat}
        style={{ animationDuration: `${CANNON_RESOLVE_MS * 0.4}ms` }}
      >
        {dice.map(({ index, face }) => (
          <img
            className="tower-die"
            data-face={face}
            key={`${seat}-${index}`}
            src={`/assets/dice/dice-${face}.png`}
            alt=""
          />
        ))}
      </div>
    </section>
  );
}
