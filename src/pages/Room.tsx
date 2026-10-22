import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { limitNameInput } from "../../shared/protocol.ts";
import type { Intent } from "../../shared/types.ts";
import type { SfxController } from "../audio/sfx.ts";
import ErrorToast from "../components/ErrorToast.tsx";
import ConfirmLeave from "../components/ConfirmLeave.tsx";
import GameBoard from "../components/GameBoard.tsx";
import Lobby from "../components/Lobby.tsx";
import ResultModal from "../components/ResultModal.tsx";
import {
  forgetRoom,
  hasJoinedRoom,
  isRoomCode,
  loadNickname,
  normalizeRoomCode,
  saveNickname,
} from "../net/identity.ts";
import { useRoom } from "../net/useRoom.ts";

interface Entry {
  intent: Intent;
  name: string;
}
function routeEntry(value: unknown): Entry | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  return (candidate.intent === "join" || candidate.intent === "create") &&
    typeof candidate.name === "string"
    ? { intent: candidate.intent, name: limitNameInput(candidate.name) }
    : null;
}
export default function Room({ sfx }: { sfx: SfxController }) {
  const { code: rawCode = "" } = useParams();
  const code = normalizeRoomCode(rawCode);
  const location = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState(() => routeEntry(location.state)?.name ?? loadNickname());
  const [entry, setEntry] = useState<Entry | null>(
    () =>
      routeEntry(location.state) ??
      (hasJoinedRoom(code)
        ? { intent: "join", name: loadNickname() }
        : import.meta.env.DEV && new URLSearchParams(location.search).has("mock")
          ? { intent: "join", name: loadNickname() }
          : null),
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const heardEvent = useRef(-1);
  const room = useRoom({
    code,
    name: entry?.name ?? name,
    intent: entry?.intent ?? "join",
    enabled: !!entry && isRoomCode(code),
    onCodeChange: (next) =>
      navigate(`/room/${next}${location.search}`, {
        replace: true,
        state: { intent: "join", name },
      }),
  });
  useEffect(() => {
    if (room.pendingEvent && room.pendingEvent.eventId > heardEvent.current) {
      heardEvent.current = room.pendingEvent.eventId;
      sfx.playEvent(room.pendingEvent);
    }
  }, [room.pendingEvent, sfx]);
  const goHome = () => {
    room.send({ type: "leave" });
    room.close();
    forgetRoom(code);
    navigate("/");
  };
  const leave = () => {
    if (room.state?.phase === "playing") setConfirmLeave(true);
    else goHome();
  };
  if (!isRoomCode(code))
    return (
      <main className="room-shell">
        <h1>Invalid room code</h1>
        <p>Room codes have 4 letters or numbers, without look-alikes.</p>
        <button className="btn btn-secondary" onClick={() => navigate("/")}>
          Back to Home
        </button>
      </main>
    );
  if (!entry)
    return (
      <main className="room-shell">
        <section className="home-card">
          <h1>Join room {code}</h1>
          <label htmlFor="invite-name">Nickname</label>
          <input
            id="invite-name"
            className="form-control"
            value={name}
            onChange={(event) => setName(limitNameInput(event.target.value))}
            autoComplete="nickname"
          />
          <button
            className="btn btn-success"
            disabled={!name.trim()}
            onClick={() => {
              saveNickname(name);
              setEntry({ name, intent: "join" });
            }}
          >
            Join Room
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </section>
      </main>
    );
  if (room.error?.fatal)
    return (
      <main className="room-shell">
        <h1>Could not join room {code}</h1>
        <p role="alert">{room.error.message}</p>
        <button className="btn btn-secondary" onClick={goHome}>
          Back to Home
        </button>
      </main>
    );
  if (!room.state || !room.seat)
    return (
      <main className="room-shell">
        <h1>Connecting to room {code}…</h1>
        <button className="btn btn-secondary" onClick={goHome}>
          Back to Home
        </button>
      </main>
    );
  const disabled = room.status !== "connected" || room.awaitingAction;
  return (
    <main className="room-shell">
      <header className="room-header">
        <span>Room {code}</span>
        {room.state.phase !== "lobby" && (
          <button className="btn btn-secondary" onClick={leave}>
            Leave
          </button>
        )}
      </header>
      {room.status !== "connected" && (
        <p className="connection-banner" role="alert">
          Connection lost, reconnecting…
        </p>
      )}
      {room.error && <ErrorToast key={room.error.message} message={room.error.message} />}
      {room.state.phase === "lobby" ? (
        <Lobby
          state={room.state}
          seat={room.seat}
          disabled={disabled}
          onIntent={room.send}
          onLeave={leave}
        />
      ) : (
        <GameBoard
          state={room.state}
          seat={room.seat}
          clockOffset={room.clockOffset}
          pendingEvent={room.pendingEvent}
          actionRejected={!!room.error && !room.error.fatal}
          previousState={room.previousState}
          disabled={disabled}
          onIntent={room.send}
          onEventPlayed={room.markEventPlayed}
        />
      )}
      {room.state.phase === "finished" && (
        <ResultModal
          state={room.state}
          seat={room.seat}
          disabled={disabled}
          onIntent={room.send}
          onHome={goHome}
        />
      )}
      {confirmLeave && <ConfirmLeave onConfirm={goHome} onClose={() => setConfirmLeave(false)} />}
    </main>
  );
}
