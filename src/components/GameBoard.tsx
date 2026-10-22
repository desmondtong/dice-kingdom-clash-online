import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANNON_RESOLVE_MS,
  POWER_RESOLVE_MS,
  POWER_ROUNDS,
  ROUNDS,
} from "../../shared/constants.ts";
import type { ClientMessage, GameEvent, RoomState, Seat } from "../../shared/types.ts";
import CannonPanel from "./CannonPanel.tsx";
import CountdownOverlay from "./CountdownOverlay.tsx";
import PowerDeck from "./PowerDeck.tsx";
import Timer from "./Timer.tsx";
import Toast from "./Toast.tsx";
import Tower from "./Tower.tsx";
import TurnBanner from "./TurnBanner.tsx";

interface GameBoardProps {
  state: RoomState;
  seat: Seat;
  clockOffset: number;
  pendingEvent: GameEvent | null;
  previousState: RoomState | null;
  disabled: boolean;
  actionRejected?: boolean;
  onIntent: (intent: ClientMessage) => void;
  onEventPlayed: (eventId: number) => void;
}

interface BoardAnimation {
  event: GameEvent;
  powerRevealed: boolean;
  cannonHit: boolean;
  previousTowers: NonNullable<RoomState["match"]>["towers"] | null;
}

const POWER_REVEAL_MS = POWER_RESOLVE_MS * 0.6;
const CANNON_HIT_MS = CANNON_RESOLVE_MS * 0.4;

function opponentOf(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

export default function GameBoard({
  state,
  seat,
  clockOffset,
  pendingEvent,
  previousState,
  disabled,
  actionRejected = false,
  onIntent,
  onEventPlayed,
}: GameBoardProps) {
  const [submittedVersion, setSubmittedVersion] = useState<number | null>(null);
  const [animation, setAnimation] = useState<BoardAnimation | null>(null);
  const [toastEvent, setToastEvent] = useState<GameEvent | null>(null);
  const scheduledEventId = useRef<number | null>(null);
  const playedEventId = useRef(-1);
  const previousSnapshot = useRef(previousState);
  useEffect(() => {
    previousSnapshot.current = previousState;
  }, [previousState]);

  const match = state.match;
  const opponent = opponentOf(seat);
  const beginAnimation = useCallback((event: GameEvent) => {
    setAnimation({
      event,
      powerRevealed: false,
      cannonHit: false,
      previousTowers: previousSnapshot.current?.match?.towers ?? null,
    });
  }, []);

  useEffect(() => {
    if (
      pendingEvent === null ||
      pendingEvent.eventId <= playedEventId.current ||
      scheduledEventId.current === pendingEvent.eventId
    ) {
      return undefined;
    }

    const event = pendingEvent;
    scheduledEventId.current = event.eventId;
    setToastEvent(event);

    if (event.type === "turnSkipped") {
      playedEventId.current = event.eventId;
      scheduledEventId.current = null;
      onEventPlayed(event.eventId);
      return undefined;
    }

    // A new server event is an external subscription update; this only starts its local CSS window.
    beginAnimation(event);

    const timers: number[] = [];
    if (event.type === "power") {
      timers.push(
        window.setTimeout(() => {
          setAnimation((current) =>
            current?.event.eventId === event.eventId
              ? { ...current, powerRevealed: true }
              : current,
          );
        }, POWER_REVEAL_MS),
      );
    } else {
      timers.push(
        window.setTimeout(() => {
          setAnimation((current) =>
            current?.event.eventId === event.eventId ? { ...current, cannonHit: true } : current,
          );
        }, CANNON_HIT_MS),
      );
    }

    const resolveWindow = event.type === "power" ? POWER_RESOLVE_MS : CANNON_RESOLVE_MS;
    timers.push(
      window.setTimeout(() => {
        playedEventId.current = event.eventId;
        scheduledEventId.current = null;
        setAnimation((current) => (current?.event.eventId === event.eventId ? null : current));
        onEventPlayed(event.eventId);
      }, resolveWindow),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (scheduledEventId.current === event.eventId) {
        scheduledEventId.current = null;
      }
    };
  }, [beginAnimation, onEventPlayed, pendingEvent]);

  if (match === null) {
    return (
      <section className="game-board game-board-empty" aria-label="Game board">
        <p>Waiting for the match to begin.</p>
      </section>
    );
  }

  const cannonEvent = animation?.event.type === "cannon" ? animation.event : null;
  const cannonHit = cannonEvent !== null && animation?.cannonHit === true;
  const holdsCannonHp = pendingEvent?.type === "cannon" && !cannonHit;
  const beforeHit = animation?.previousTowers ?? previousState?.match?.towers;
  const visibleTowers = holdsCannonHp && beforeHit ? beforeHit : match.towers;
  const canAct =
    !disabled &&
    (submittedVersion !== state.version || actionRejected) &&
    state.phase === "playing";
  const canRollPower = canAct && match.currentSeat === seat && match.step === "power";
  const canRollCannon = canAct && match.currentSeat === seat && match.step === "cannon";
  const opponentConnected = state.players[opponent]?.connected ?? false;
  const powerEvent = animation?.event.type === "power" ? animation.event : null;

  const sendRoll = (type: Extract<ClientMessage, { type: "rollPower" | "rollCannon" }>["type"]) => {
    setSubmittedVersion(state.version);
    onIntent({ type, turnId: match.turnId });
  };

  return (
    <section className="game-board" aria-label="Dice Kingdom Clash board" data-phase={state.phase}>
      <header className="game-header">
        <div>
          <p className="round-message">
            Round {match.round} of {ROUNDS}
          </p>
          <div className="turn-counter" aria-hidden="true">
            {Array.from({ length: ROUNDS }, (_, index) => (
              <span
                key={index}
                className={`counter${POWER_ROUNDS.includes(index + 1) ? " power-turn" : ""}${index + 1 > match.round ? " inactive" : ""}${index + 1 === match.round ? " current-round" : ""}`}
              />
            ))}
          </div>
        </div>
        <TurnBanner
          phase={state.phase}
          currentSeat={match.currentSeat}
          seat={seat}
          step={match.step}
        />
        {state.phase === "playing" ? (
          <Timer deadline={match.turnDeadline} clockOffset={clockOffset} />
        ) : null}
      </header>

      <div className="game-layout">
        <Tower
          seat={1}
          name={state.players[1]?.name ?? "Player 1"}
          tower={visibleTowers[1]}
          towerSeed={match.towerSeed}
          isYou={seat === 1}
          isHit={cannonHit && cannonEvent.target === 1}
        />

        <section className="game-controls" aria-label="Game controls">
          <p
            className={`connection-banner${opponentConnected ? " is-connected" : ""}`}
            role="status"
          >
            <span className="connection-dot" aria-hidden="true" />
            {opponentConnected ? "Opponent connected" : "Opponent disconnected, reconnecting…"}
          </p>
          <PowerDeck
            event={powerEvent}
            revealed={animation?.powerRevealed === true}
            enabled={canRollPower}
            onRoll={() => sendRoll("rollPower")}
          />
          <CannonPanel
            event={cannonEvent}
            hit={cannonHit}
            enabled={canRollCannon}
            onRoll={() => sendRoll("rollCannon")}
          />
          <Toast event={toastEvent} state={state} />
        </section>

        <Tower
          seat={2}
          name={state.players[2]?.name ?? "Player 2"}
          tower={visibleTowers[2]}
          towerSeed={match.towerSeed}
          isYou={seat === 2}
          isHit={cannonHit && cannonEvent.target === 2}
        />
      </div>

      {state.phase === "countdown" && state.countdownEndsAt !== null ? (
        <CountdownOverlay endsAt={state.countdownEndsAt} clockOffset={clockOffset} />
      ) : null}
    </section>
  );
}
