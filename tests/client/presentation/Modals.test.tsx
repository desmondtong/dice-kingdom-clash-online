import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmLeave from "../../../src/components/ConfirmLeave.tsx";
import HowToPlayModal from "../../../src/components/HowToPlayModal.tsx";

describe("presentation modals", () => {
  it("teaches the approved online rules and closes by button or Escape", () => {
    const onClose = vi.fn();
    render(<HowToPlayModal onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "How To Play" })).toBeInTheDocument();
    expect(screen.getByText("50 HP", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/multiplied together/)).toBeInTheDocument();
    expect(screen.getByText(/up to 8 rounds/)).toBeInTheDocument();
    expect(screen.getByText(/auto-rolls/)).toBeInTheDocument();
    expect(screen.getByText(/cannon step is skipped/)).toBeInTheDocument();
    expect(screen.getByText(/There is no pause/)).toBeInTheDocument();
    expect(screen.getByText(/first seat alternates/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses the exact leave warning and routes Leave, Stay, and Escape correctly", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmLeave onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByText("Leave the match? Your opponent wins.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("restores focus to the invoking element when dismissed", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open tutorial";
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<HowToPlayModal onClose={vi.fn()} />);

    const modalContent = screen
      .getByRole("dialog", { name: "How To Play" })
      .querySelector<HTMLElement>(".modal-content");
    expect(modalContent).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
