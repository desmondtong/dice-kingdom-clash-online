import { CANNON_RESOLVE_MS } from "../../shared/constants.ts";
import type { CannonEvent } from "../../shared/types.ts";

interface CannonPanelProps {
  event: CannonEvent | null;
  hit?: boolean;
  enabled: boolean;
  onRoll: () => void;
}

function CannonDie({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="cannon-die-placeholder" aria-hidden="true">
        ?
      </div>
    );
  }

  return (
    <img
      className="brown-dice-png"
      src={`/assets/cannon-dice/${value}.png`}
      alt={`Cannon die ${value}`}
    />
  );
}

export default function CannonPanel({ event, hit = false, enabled, onRoll }: CannonPanelProps) {
  const isTumbling = event !== null && !hit;
  const equation =
    event && hit ? `${event.dice[0]} × ${event.dice[1]} = ${event.rawDamage}` : "A × B = ?";

  return (
    <section className="cannon-panel" aria-label="Cannon dice">
      <img className="cannon-image" src="/assets/cannon.png" alt="Cannon" />
      <div
        className={`cannon-dice-row${isTumbling ? " is-tumbling" : ""}`}
        style={{ animationDuration: `${CANNON_RESOLVE_MS * 0.4}ms` }}
      >
        <CannonDie value={event?.dice[0] ?? null} />
        <span className="cannon-operator" aria-hidden="true">
          ×
        </span>
        <CannonDie value={event?.dice[1] ?? null} />
      </div>
      <p className="cannon-equation" data-testid="cannon-equation">
        {equation}
      </p>
      <button className="btn cannon-roll-button" type="button" disabled={!enabled} onClick={onRoll}>
        Roll Cannon
      </button>
    </section>
  );
}
