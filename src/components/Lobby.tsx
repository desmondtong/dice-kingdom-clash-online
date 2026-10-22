import { useState } from "react";
import type { ClientMessage, RoomState, Seat } from "../../shared/types.ts";
import { opponent } from "../../shared/protocol.ts";

interface LobbyProps {
  state: RoomState;
  seat: Seat;
  disabled: boolean;
  onIntent: (intent: ClientMessage) => void;
  onLeave: () => void;
}

interface PlayerCardProps {
  isYou: boolean;
  label: string;
  player: RoomState["players"][Seat];
}

function PlayerCard({ isYou, label, player }: PlayerCardProps) {
  if (!player) {
    return (
      <article className="card h-100 text-center" data-testid={`${label.toLowerCase()}-card`}>
        <div className="card-body">
          <h2 className="h4">{label}</h2>
          {isYou ? <span className="badge text-bg-primary">You</span> : null}
          <p className="mb-0 text-muted">Waiting for opponent…</p>
        </div>
      </article>
    );
  }

  return (
    <article className="card h-100" data-testid={`${label.toLowerCase()}-card`}>
      <div className="card-body">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <h2 className="h4 mb-2">{player.name}</h2>
          {isYou ? <span className="badge text-bg-primary">You</span> : null}
        </div>
        <p className="mb-2">
          <span
            aria-label={player.connected ? "Connected" : "Disconnected"}
            className={`me-1 ${player.connected ? "text-success" : "text-secondary"}`}
            role="img"
          >
            ●
          </span>
          {player.connected ? "Connected" : "Disconnected, reconnecting…"}
        </p>
        <span className={`badge ${player.ready ? "text-bg-success" : "text-bg-secondary"}`}>
          {player.ready ? "Ready" : "Not ready"}
        </span>
      </div>
    </article>
  );
}

function inviteLink(code: string): string {
  return `${window.location.origin}/room/${code}`;
}

/** Lobby state presented exactly as the authoritative room snapshot describes it. */
export default function Lobby({ state, seat, disabled, onIntent, onLeave }: LobbyProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const opponentSeat = opponent(seat);
  const ownPlayer = state.players[seat];
  const opponentPlayer = state.players[opponentSeat];
  const canReady =
    state.phase === "lobby" &&
    ownPlayer !== undefined &&
    opponentPlayer !== undefined &&
    !ownPlayer.ready &&
    !disabled;

  const copyInviteLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(inviteLink(state.code));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <main className="container py-5 lobby-screen">
      <div className="mx-auto text-center" style={{ maxWidth: "48rem" }}>
        <p className="text-uppercase mb-1">Room code</p>
        <h1 className="display-3" data-testid="room-code">
          {state.code}
        </h1>
        <button
          className="btn btn-outline-primary mb-4"
          disabled={disabled}
          onClick={copyInviteLink}
          type="button"
        >
          Copy invite link
        </button>
        {copyStatus === "copied" ? <p role="status">Invite link copied.</p> : null}
        {copyStatus === "failed" ? (
          <p role="alert">Could not copy the invite link. Please copy the room code.</p>
        ) : null}
      </div>

      <div className="row g-4 mx-auto" style={{ maxWidth: "48rem" }}>
        <div className="col-md-6">
          <PlayerCard isYou={seat === 1} label="Seat 1" player={state.players[1]} />
        </div>
        <div className="col-md-6">
          <PlayerCard isYou={seat === 2} label="Seat 2" player={state.players[2]} />
        </div>
      </div>

      <div className="d-flex flex-column align-items-center gap-3 mt-4">
        <button
          className="btn btn-success btn-lg"
          disabled={!canReady}
          onClick={() => onIntent({ type: "ready" })}
          type="button"
        >
          Ready
        </button>
        <button
          className="btn btn-outline-danger"
          disabled={disabled}
          onClick={onLeave}
          type="button"
        >
          Leave
        </button>
      </div>
    </main>
  );
}
