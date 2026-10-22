import { POWER_RESOLVE_MS } from "../../shared/constants.ts";
import type { Power, PowerEvent } from "../../shared/types.ts";

interface PowerDeckProps {
  event: PowerEvent | null;
  revealed: boolean;
  enabled: boolean;
  onRoll: () => void;
}

const POWER_DICE: readonly Power[] = ["shield", "ricochet", "heal", "swap"];

function displayPower(power: Power): string {
  return power.charAt(0).toUpperCase() + power.slice(1);
}

export default function PowerDeck({ event, revealed, enabled, onRoll }: PowerDeckProps) {
  const selectedPower = revealed ? event?.power : null;

  return (
    <section
      className={`power-dice-deck${event && !revealed ? " is-shuffling" : ""}`}
      aria-label="Power dice deck"
    >
      <div className="power-dice-list" style={{ animationDuration: `${POWER_RESOLVE_MS * 0.6}ms` }}>
        {POWER_DICE.map((power) => (
          <div
            className={`power-die${selectedPower === power ? " is-chosen" : ""}`}
            key={power}
            data-power={power}
          >
            <img
              src={`/assets/power-dice/${power}-dice.png`}
              alt={`${displayPower(power)} power die`}
            />
            {selectedPower === power ? (
              <span className="power-label">{displayPower(power)}</span>
            ) : null}
          </div>
        ))}
      </div>
      <button className="btn power-roll-button" type="button" disabled={!enabled} onClick={onRoll}>
        Roll Power Dice
      </button>
    </section>
  );
}
