import { useEffect, useState } from "react";
import type { GameEvent, RoomState } from "../../shared/types.ts";

interface ToastProps {
  event: GameEvent | null;
  state: RoomState;
}

const TOAST_MS = 2_400;

function playerName(state: RoomState, seat: 1 | 2): string {
  return state.players[seat]?.name ?? `Player ${seat}`;
}

function messageFor(event: GameEvent, state: RoomState): string {
  const actor = playerName(state, event.actor);

  switch (event.type) {
    case "cannon":
      return `${actor} fired ${event.dice[0]} × ${event.dice[1]} = ${event.rawDamage}${
        event.reflected ? " — ricochet!" : ""
      }${event.shielded ? " Shield absorbed part of the hit." : ""}`;
    case "power":
      return `${actor} rolled ${event.power}${
        event.auto ? " automatically" : ""
      }${event.healAmount === undefined ? "." : ` and restored ${event.healAmount} HP.`}`;
    case "turnSkipped":
      return `${actor}'s turn timed out.`;
  }
}

export default function Toast({ event, state }: ToastProps) {
  const [visibleEvent, setVisibleEvent] = useState<GameEvent | null>(null);

  useEffect(() => {
    if (event !== null) {
      const displayEvent = () => setVisibleEvent(event);
      displayEvent();
    }
  }, [event]);

  useEffect(() => {
    if (visibleEvent === null) return undefined;

    const timeout = window.setTimeout(() => setVisibleEvent(null), TOAST_MS);
    return () => window.clearTimeout(timeout);
  }, [visibleEvent]);

  if (visibleEvent === null) return null;

  return (
    <p className="game-toast" role="status" aria-live="polite">
      {messageFor(visibleEvent, state)}
    </p>
  );
}
