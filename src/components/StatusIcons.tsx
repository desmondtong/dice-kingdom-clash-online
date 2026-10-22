import type { Seat, TowerState } from "../../shared/types.ts";

interface StatusIconsProps {
  tower: TowerState;
  seat: Seat;
}

export default function StatusIcons({ tower, seat }: StatusIconsProps) {
  const statuses = [
    tower.shield ? { label: "Shield active", asset: "shield" } : null,
    tower.reflectNextAttack ? { label: "Ricochet active", asset: "ricochet" } : null,
  ].filter((status): status is { label: string; asset: "shield" | "ricochet" } => status !== null);

  if (statuses.length === 0) {
    return (
      <div
        className="status-icons"
        data-testid={`status-icons-${seat}`}
        aria-label="No active powers"
      />
    );
  }

  return (
    <div className="status-icons" data-testid={`status-icons-${seat}`} aria-label="Active powers">
      {statuses.map((status) => (
        <img
          className="power-dice-icon"
          key={status.asset}
          src={`/assets/power-dice/${status.asset}-dice.png`}
          alt={status.label}
        />
      ))}
    </div>
  );
}
