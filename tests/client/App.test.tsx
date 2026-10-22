import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.tsx";
const sounds = vi.hoisted(() => ({
  unlock: vi.fn(),
  play: vi.fn(),
  playEvent: vi.fn(),
  dispose: vi.fn(),
  setMusicMuted: vi.fn(),
}));
vi.mock("../../src/audio/sfx.ts", () => ({ createSfx: () => sounds }));
// The real connection is the default; this inert fake keeps tests off the network.
vi.mock("partysocket", () => ({
  default: class {
    readyState = 0;
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
    reconnect() {}
  },
}));
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("routed client", () => {
  it("shows Home without opening any connection", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Dice Kingdom Clash Online" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Room" })).toBeDisabled();
  });
  it("limits pasted grapheme emoji to twelve", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "👨‍👩‍👧‍👦".repeat(14) } });
    expect(screen.getByLabelText("Nickname")).toHaveValue("👨‍👩‍👧‍👦".repeat(12));
  });
  it("validates code alphabet before joining and uppercases input", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "ab0d" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid 4-character");
    expect(window.location.pathname).toBe("/");
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "kx7p" } });
    expect(screen.getByLabelText("Room code")).toHaveValue("KX7P");
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    await waitFor(() => expect(window.location.pathname).toBe("/room/KX7P"));
    expect(localStorage.getItem("dkc.nickname")).toBe("Alex");
  });
  it("creates a valid room code", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Desmond" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Room" }));
    await waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/room\/[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/),
    );
  });
  it("opens and closes the tutorial", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "How To Play" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("asks for nickname before connecting on a direct invite", () => {
    window.history.replaceState(null, "", "/room/KX7P");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Join room KX7P" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Room" })).toBeDisabled();
  });
  it("reconnects a known room automatically after refresh", async () => {
    sessionStorage.setItem("dkc.rooms", '["KX7P"]');
    window.history.replaceState(null, "", "/room/KX7P?mock=lobbyWaiting");
    render(<App />);
    await screen.findByRole("button", { name: /^Ready/ });
    expect(screen.queryByRole("heading", { name: "Join room KX7P" })).not.toBeInTheDocument();
  });
  it("rejects invalid invite codes locally", () => {
    window.history.replaceState(null, "", "/room/AB0D");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Invalid room code" })).toBeInTheDocument();
  });
  it("lists every fixture for both seats in development", async () => {
    window.history.replaceState(null, "", "/dev/fixtures");
    render(<App />);
    await screen.findByRole("heading", { name: "Room fixture gallery" });
    expect(screen.getAllByRole("link", { name: "Seat 1" })).toHaveLength(17);
    expect(screen.getAllByRole("link", { name: "Seat 2" })).toHaveLength(17);
  });
  it("does not expose the fixture route in production", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const { default: ProductionApp } = await import("../../src/App.tsx");
    window.history.replaceState(null, "", "/dev/fixtures");
    render(<ProductionApp />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
  it("mutes and unmutes the background music and remembers the choice", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Mute music" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Unmute music" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(sounds.setMusicMuted).toHaveBeenLastCalledWith(true);
    expect(localStorage.getItem("dkc.musicMuted")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Unmute music" }));
    expect(sounds.setMusicMuted).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem("dkc.musicMuted")).toBe("0");
  });
  it("starts muted when the browser remembered Music off", () => {
    localStorage.setItem("dkc.musicMuted", "1");
    render(<App />);
    expect(screen.getByRole("button", { name: "Unmute music" })).toBeInTheDocument();
    expect(sounds.setMusicMuted).toHaveBeenCalledWith(true);
  });
});
