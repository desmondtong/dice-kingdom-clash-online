import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Lobby from "../../../src/components/Lobby.tsx";
import {
  lobbyBothJoined,
  lobbyOpponentDisconnected,
  lobbyWaiting,
} from "../../../shared/fixtures/index.ts";
import type { RoomState, Seat } from "../../../shared/types.ts";

const lobbyFixtures: Array<[string, RoomState]> = [
  ["waiting", lobbyWaiting],
  ["both joined", lobbyBothJoined],
  ["opponent disconnected", lobbyOpponentDisconnected],
];

describe("Lobby", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(
    lobbyFixtures.flatMap(([name, state]) =>
      ([1, 2] as const).map((seat) => [name, state, seat] as const),
    ),
  )("renders the %s lobby fixture for seat %i", (_name, state, seat) => {
    render(
      <Lobby disabled={false} onIntent={vi.fn()} onLeave={vi.fn()} seat={seat} state={state} />,
    );

    expect(screen.getByTestId("room-code")).toHaveTextContent(state.code);
    expect(screen.getByTestId("seat 1-card")).toBeInTheDocument();
    expect(screen.getByTestId("seat 2-card")).toBeInTheDocument();
    if (state.players[seat]) expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("enables Ready only for a present lobby player who has not already voted", () => {
    const onIntent = vi.fn();
    const { rerender } = render(
      <Lobby
        disabled={false}
        onIntent={onIntent}
        onLeave={vi.fn()}
        seat={2}
        state={lobbyBothJoined}
      />,
    );

    const ready = screen.getByRole("button", { name: "Ready" });
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    expect(onIntent).toHaveBeenCalledWith({ type: "ready" });

    rerender(
      <Lobby
        disabled={false}
        onIntent={onIntent}
        onLeave={vi.fn()}
        seat={1}
        state={lobbyBothJoined}
      />,
    );
    expect(screen.getByRole("button", { name: "Ready" })).toBeDisabled();

    rerender(
      <Lobby
        disabled={true}
        onIntent={onIntent}
        onLeave={vi.fn()}
        seat={2}
        state={lobbyBothJoined}
      />,
    );
    expect(screen.getByRole("button", { name: "Ready" })).toBeDisabled();

    rerender(
      <Lobby
        disabled={false}
        onIntent={onIntent}
        onLeave={vi.fn()}
        seat={1}
        state={lobbyWaiting}
      />,
    );
    expect(screen.getByRole("button", { name: "Ready" })).toBeDisabled();
  });

  it("copies the invite link and reports a clipboard failure without throwing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { rerender } = render(
      <Lobby
        disabled={false}
        onIntent={vi.fn()}
        onLeave={vi.fn()}
        seat={1}
        state={lobbyBothJoined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    await screen.findByRole("status");
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/room/${lobbyBothJoined.code}`,
    );

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    rerender(
      <Lobby
        disabled={false}
        onIntent={vi.fn()}
        onLeave={vi.fn()}
        seat={1}
        state={lobbyBothJoined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy the invite link");
  });

  it("forwards Leave only when actions are available", () => {
    const onLeave = vi.fn();
    render(
      <Lobby
        disabled={false}
        onIntent={vi.fn()}
        onLeave={onLeave}
        seat={1 as Seat}
        state={lobbyBothJoined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
