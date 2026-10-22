import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANNON_RESOLVE_MS } from "../../../shared/constants.ts";
import { fixtures } from "../../../shared/fixtures/index.ts";
import GameBoard from "../../../src/components/GameBoard.tsx";
const noop = () => undefined;
afterEach(() => vi.useRealTimers());
describe("board integration regressions", () => {
  it("releases a local click lock after a newer snapshot even if the turn ID stays the same", () => {
    const props = {
      state: fixtures.playingCannonStep,
      seat: 1 as const,
      clockOffset: 0,
      pendingEvent: null,
      previousState: null,
      disabled: false,
      onIntent: noop,
      onEventPlayed: noop,
    };
    const { rerender } = render(<GameBoard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Roll Cannon" }));
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeDisabled();
    rerender(<GameBoard {...props} state={{ ...props.state, version: props.state.version + 1 }} />);
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeEnabled();
  });
  it("releases a rejected action without requiring a new server snapshot", () => {
    const props = {
      state: fixtures.playingCannonStep,
      seat: 1 as const,
      clockOffset: 0,
      pendingEvent: null,
      previousState: null,
      disabled: false,
      onIntent: noop,
      onEventPlayed: noop,
    };
    const { rerender } = render(<GameBoard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Roll Cannon" }));
    rerender(<GameBoard {...props} actionRejected />);
    expect(screen.getByRole("button", { name: "Roll Cannon" })).toBeEnabled();
  });
  it("keeps the captured pre-hit HP across an unrelated newer snapshot and reveals the equation at impact", () => {
    vi.useFakeTimers();
    const props = {
      state: fixtures.resolvingCannon,
      seat: 1 as const,
      clockOffset: 0,
      pendingEvent: fixtures.resolvingCannon.lastEvent,
      previousState: fixtures.playingCannonStep,
      disabled: false,
      onIntent: noop,
      onEventPlayed: noop,
    };
    const { rerender } = render(<GameBoard {...props} />);
    expect(screen.getByTestId("cannon-equation")).toHaveTextContent("A × B = ?");
    act(() => vi.advanceTimersByTime(300));
    rerender(
      <GameBoard {...props} state={{ ...props.state, version: 28 }} previousState={props.state} />,
    );
    expect(screen.getByTestId("tower-1-hp")).toHaveTextContent("50 HP");
    act(() => vi.advanceTimersByTime(CANNON_RESOLVE_MS * 0.4 - 300));
    expect(screen.getByTestId("tower-1-hp")).toHaveTextContent("25 HP");
    expect(screen.getByTestId("cannon-equation")).toHaveTextContent("4 × 5 = 20");
  });
});
