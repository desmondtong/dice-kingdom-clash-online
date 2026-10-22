import { useEffect, useState } from "react";

interface TimerProps {
  deadline: number;
  clockOffset: number;
}

function remainingSeconds(deadline: number, clockOffset: number): number {
  return Math.max(0, Math.ceil((deadline - (Date.now() + clockOffset)) / 1_000));
}

export default function Timer({ deadline, clockOffset }: TimerProps) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(deadline, clockOffset));

  useEffect(() => {
    const update = () => setSeconds(remainingSeconds(deadline, clockOffset));
    update();
    const interval = window.setInterval(update, 250);

    return () => window.clearInterval(interval);
  }, [clockOffset, deadline]);

  return (
    <output className="timer" data-testid="turn-timer" aria-label={`${seconds} seconds remaining`}>
      00:{String(seconds).padStart(2, "0")}
    </output>
  );
}
