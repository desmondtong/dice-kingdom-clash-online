import { useEffect, useState } from "react";

interface CountdownOverlayProps {
  endsAt: number;
  clockOffset: number;
}

function remainingSeconds(endsAt: number, clockOffset: number): number {
  return Math.max(0, Math.ceil((endsAt - (Date.now() + clockOffset)) / 1_000));
}

export default function CountdownOverlay({ endsAt, clockOffset }: CountdownOverlayProps) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(endsAt, clockOffset));

  useEffect(() => {
    const update = () => setSeconds(remainingSeconds(endsAt, clockOffset));
    update();
    const interval = window.setInterval(update, 250);

    return () => window.clearInterval(interval);
  }, [clockOffset, endsAt]);

  const message = seconds > 0 ? String(seconds) : "Go!";

  return (
    <div
      className="countdown-overlay"
      role="status"
      aria-live="assertive"
      aria-label={`Match begins in ${message}`}
    >
      <p className="countdown-message">{message}</p>
    </div>
  );
}
