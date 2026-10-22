import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../../src/App.tsx";

type SocketOptions = { onOpen?: () => void; onClose?: () => void };
let lastOptions: SocketOptions = {};

// No real network in unit tests: capture the socket callbacks instead.
vi.mock("partysocket/react", () => ({
  default: (options: SocketOptions) => {
    lastOptions = options;
    return {};
  },
}));

describe("scaffold placeholder App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Dice Kingdom Clash Online" })).toBeInTheDocument();
  });

  it("shows the server connection status", () => {
    render(<App />);
    const status = screen.getByTestId("server-status");
    expect(status).toHaveTextContent("Server: connecting…");

    act(() => lastOptions.onOpen?.());
    expect(status).toHaveTextContent("Server: connected");

    act(() => lastOptions.onClose?.());
    expect(status).toHaveTextContent("Server: disconnected");
  });
});
