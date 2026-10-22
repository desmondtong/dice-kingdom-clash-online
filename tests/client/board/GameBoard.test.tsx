import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANNON_RESOLVE_MS } from "../../../shared/constants.ts";
import {
  FIXTURE_NOW,
  countdown,
  fixtures,
  playingAfterTurnSkipped,
  playingCannonStep,
  playingPowerStep,
  resolvingCannon,
  resolvingPower,
} from "../../../shared/fixtures/index.ts";
import type { ClientMessage, GameEvent, RoomState, Seat } from "../../../shared/types.ts";
import CountdownOverlay from "../../../src/components/CountdownOverlay.tsx";
import GameBoard from "../../../src/components/GameBoard.tsx";
import Timer from "../../../src/components/Timer.tsx";

const noop = () => undefined;

function renderBoard(
  state: RoomState,
  seat: Seat,
  options: Partial<{
    pendingEvent: GameEvent | null;
    previousState: RoomState | null;
    disabled: boolean;
    onIntent: (intent: ClientMessage) => void;
    onEventPlayed: (eventId: number) => void;
  }> = {},
) {
  const onIntent = options.onIntent ?? vi.fn<(intent: ClientMessage) => void>();
  const onEventPlayed = options.onEventPlayed ?? vi.fn<(eventId: number) => void>();

  return {
    onIntent,
    onEventPlayed,
    ...render(
      <GameBoard
        state={state}
        seat={seat}
        clockOffset={0}
        pendingEvent={options.pendingEvent ?? null}
        previousState={options.previousState ?? null}
        disabled={options.disabled ?? false}
        onIntent={onIntent}
        onEventPlayed={onEventPlayed}
      />,
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

const nonLobbyFixtures = Object.entries(fixtures).filter(([, state]) => state.phase !== "lobby");

describe("GameBoard fixture coverage", () => {
  it.each(nonLobbyFixtures)("renders %s for seat 1", (name, state) => {
    renderBoard(state, 1);

    expect(screen.getByLabelText("Dice Kingdom Clash board")).toHaveAttribute(
      "data-phase",
      state.phase,
    );
    expect(screen.getByTestId("tower-1")).toBeInTheDocument();
    expect(screen.getByTestId("tower-2")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(name).not.toHaveLength(0);
  });

  it.each(nonLobbyFixtures)("renders %s for seat 2", (name, state) => {
    renderBoard(state, 2);

    expect(screen.getByLabelText("Dice Kingdom Clash board")).toHaveAttribute(
      "data-phase",
      state.phase,
    );
    expect(screen.getByTestId("tower-1")).toBeInTheDocument();
    expect(screen.getByTestId("tower-2")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(name).not.toHaveLength(0);
  });
});

describe("GameBoard action eligibility", () => {
  it("enables only the active player's Power roll and locks it after the click", () => {
    const { onIntent } = renderBoard(playingPowerStep, 1);
    const powerButton = screen.getByRole("button", { name: "Roll Power Dice" });

    expect(powerButton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeDisabled();

    fireEvent.click(powerButton);

    expect(onIntent).toHaveBeenCalledWith({
      type: "rollPower",
      turnId: playingPowerStep.match?.turnId,
    });
    expect(powerButton).toBeDisabled();
  });

  it("enables only the active player's Cannon roll", () => {
    renderBoard(playingCannonStep, 1);

    expect(screen.getByRole("button", { name: "Roll Power Dice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeEnabled();
  });

  it("keeps both actions disabled for the opponent, resolving state, and connection-disabled boards", () => {
    const { rerender } = renderBoard(playingCannonStep, 2);

    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeDisabled();

    rerender(
      <GameBoard
        state={resolvingPower}
        seat={1}
        clockOffset={0}
        pendingEvent={null}
        previousState={null}
        disabled={false}
        onIntent={noop}
        onEventPlayed={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Roll Power Dice" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeDisabled();

    rerender(
      <GameBoard
        state={playingCannonStep}
        seat={1}
        clockOffset={0}
        pendingEvent={null}
        previousState={null}
        disabled
        onIntent={noop}
        onEventPlayed={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeDisabled();
  });
});

describe("timing displays", () => {
  it("applies clock offset and clamps the turn timer at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXTURE_NOW);
    render(<Timer deadline={FIXTURE_NOW + 7_000} clockOffset={3_000} />);

    expect(screen.getByTestId("turn-timer")).toHaveTextContent("00:04");

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId("turn-timer")).toHaveTextContent("00:00");
  });

  it("counts down from the server countdown deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXTURE_NOW);
    render(<CountdownOverlay endsAt={countdown.countdownEndsAt ?? FIXTURE_NOW} clockOffset={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("2");

    act(() => vi.advanceTimersByTime(2_100));
    expect(screen.getByRole("status")).toHaveTextContent("Go!");
  });
});

describe("GameBoard visual event state", () => {
  it("keeps seeded tower faces stable when viewed from either seat", () => {
    const { rerender } = renderBoard(playingCannonStep, 1);
    const firstFaces = Array.from(screen.getByTestId("tower-1").querySelectorAll("img")).map(
      (die) => die.getAttribute("data-face"),
    );

    rerender(
      <GameBoard
        state={playingCannonStep}
        seat={2}
        clockOffset={0}
        pendingEvent={null}
        previousState={null}
        disabled={false}
        onIntent={noop}
        onEventPlayed={noop}
      />,
    );
    const secondFaces = Array.from(screen.getByTestId("tower-1").querySelectorAll("img")).map(
      (die) => die.getAttribute("data-face"),
    );

    expect(secondFaces).toEqual(firstFaces);
  });

  it("holds the prior server HP until the cannon hit, then uses authoritative HP", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXTURE_NOW);
    const event = resolvingCannon.lastEvent;
    if (event?.type !== "cannon") throw new Error("Fixture must contain a cannon event");

    renderBoard(resolvingCannon, 1, {
      pendingEvent: event,
      previousState: playingCannonStep,
    });

    expect(screen.getByTestId("tower-1-hp")).toHaveTextContent("50 HP");

    act(() => vi.advanceTimersByTime(CANNON_RESOLVE_MS * 0.4));
    expect(screen.getByTestId("tower-1-hp")).toHaveTextContent("25 HP");
  });

  it("plays a cannon event once when the same event snapshot is rendered again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXTURE_NOW);
    const event = resolvingCannon.lastEvent;
    if (event?.type !== "cannon") throw new Error("Fixture must contain a cannon event");
    const onEventPlayed = vi.fn();
    const { rerender } = renderBoard(resolvingCannon, 1, {
      pendingEvent: event,
      previousState: playingCannonStep,
      onEventPlayed,
    });

    act(() => vi.advanceTimersByTime(CANNON_RESOLVE_MS));
    expect(onEventPlayed).toHaveBeenCalledTimes(1);

    rerender(
      <GameBoard
        state={resolvingCannon}
        seat={1}
        clockOffset={0}
        pendingEvent={event}
        previousState={playingCannonStep}
        disabled={false}
        onIntent={noop}
        onEventPlayed={onEventPlayed}
      />,
    );
    act(() => vi.advanceTimersByTime(CANNON_RESOLVE_MS));

    expect(onEventPlayed).toHaveBeenCalledTimes(1);
  });

  it("marks a skipped turn played immediately and keeps its message visible", () => {
    const event = playingAfterTurnSkipped.lastEvent;
    if (event?.type !== "turnSkipped") throw new Error("Fixture must contain a skipped-turn event");
    const onEventPlayed = vi.fn();

    renderBoard(playingAfterTurnSkipped, 2, { pendingEvent: event, onEventPlayed });

    expect(onEventPlayed).toHaveBeenCalledWith(event.eventId);
    expect(screen.getByText("Desmond's turn timed out.")).toBeInTheDocument();
  });
});
