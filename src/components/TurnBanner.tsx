import type { Phase, Seat, Step } from "../../shared/types.ts";

interface TurnBannerProps {
  phase: Phase;
  currentSeat: Seat;
  seat: Seat;
  step: Step;
}

export default function TurnBanner({ phase, currentSeat, seat, step }: TurnBannerProps) {
  let message = "Match complete";

  if (phase === "countdown") {
    message = "Get ready";
  } else if (phase === "playing") {
    if (step === "resolving") {
      message = "Resolving roll…";
    } else {
      message = currentSeat === seat ? "Your turn" : "Opponent's turn";
    }
  }

  return (
    <p className="turn-banner" data-testid="turn-banner">
      {message}
    </p>
  );
}
