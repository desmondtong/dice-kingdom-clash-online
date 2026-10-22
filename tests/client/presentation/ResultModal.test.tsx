import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResultModal from "../../../src/components/ResultModal.tsx";
import {
  finishedKo,
  finishedLeft,
  finishedRematchVoted,
  finishedRoundsWin,
  finishedTie,
} from "../../../shared/fixtures/index.ts";
import type { RoomState } from "../../../shared/types.ts";

const finishedFixtures: Array<[string, RoomState]> = [
  ["KO", finishedKo],
  ["rounds win", finishedRoundsWin],
  ["tie", finishedTie],
  ["opponent left", finishedLeft],
  ["rematch voted", finishedRematchVoted],
];

describe("ResultModal", () => {
  it.each(
    finishedFixtures.flatMap(([name, state]) =>
      ([1, 2] as const).map((seat) => [name, state, seat] as const),
    ),
  )("renders the %s fixture for seat %i", (_name, state, seat) => {
    render(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={seat}
        state={state}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Match result" })).toBeInTheDocument();
    expect(screen.getByTestId("your-final-hp")).toHaveTextContent(
      `${state.match?.towers[seat].hp} HP`,
    );
    expect(screen.getByTestId("opponent-final-hp")).toHaveTextContent(
      `${state.match?.towers[seat === 1 ? 2 : 1].hp} HP`,
    );
  });

  it("uses the server winner and reason rather than deriving a winner from final HP", () => {
    const { rerender } = render(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={1}
        state={finishedKo}
      />,
    );
    expect(screen.getByRole("heading", { name: "You win!" })).toBeInTheDocument();
    expect(screen.getByText("Knockout")).toBeInTheDocument();

    rerender(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={2}
        state={finishedRoundsWin}
      />,
    );
    expect(screen.getByRole("heading", { name: "You lose" })).toBeInTheDocument();
    expect(screen.getByText("After 8 rounds")).toBeInTheDocument();

    rerender(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={1}
        state={finishedTie}
      />,
    );
    expect(screen.getByRole("heading", { name: "It’s a tie!" })).toBeInTheDocument();

    rerender(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={1}
        state={finishedLeft}
      />,
    );
    expect(screen.getByRole("heading", { name: "Opponent left, you win" })).toBeInTheDocument();
  });

  it("handles both rematch votes and disables the waiting player", () => {
    const onIntent = vi.fn();
    const { rerender } = render(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={onIntent}
        seat={1}
        state={finishedRematchVoted}
      />,
    );

    expect(screen.getByText("Opponent is ready for a rematch.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rematch" }));
    expect(onIntent).toHaveBeenCalledWith({ type: "rematch" });

    rerender(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={onIntent}
        seat={2}
        state={finishedRematchVoted}
      />,
    );
    expect(screen.getByRole("button", { name: "Waiting for opponent" })).toBeDisabled();
  });

  it("hides rematch when the opponent left or has no remaining seat", () => {
    render(
      <ResultModal
        disabled={false}
        onHome={vi.fn()}
        onIntent={vi.fn()}
        seat={1}
        state={finishedLeft}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /rematch|waiting for opponent/i }),
    ).not.toBeInTheDocument();
  });

  it("disables rematch while client actions are disabled and returns home", () => {
    const onHome = vi.fn();
    render(<ResultModal disabled onHome={onHome} onIntent={vi.fn()} seat={1} state={finishedKo} />);

    expect(screen.getByRole("button", { name: "Rematch" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });
});
