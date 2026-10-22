import { useState } from "react";
import usePartySocket from "partysocket/react";

// Placeholder for the scaffold-project change: proves the client can reach the local
// room server. Replaced by the real app in build-game-client.

type ServerStatus = "connecting" | "connected" | "disconnected";

const SERVER_PORT = 1999;
const CHECK_ROOM = "scaffold-check";

const STATUS_LABEL: Record<ServerStatus, string> = {
  connecting: "connecting…",
  connected: "connected",
  disconnected: "disconnected",
};

const STATUS_BADGE: Record<ServerStatus, string> = {
  connecting: "text-bg-warning",
  connected: "text-bg-success",
  disconnected: "text-bg-danger",
};

export default function App() {
  const [status, setStatus] = useState<ServerStatus>("connecting");

  usePartySocket({
    host: `${window.location.hostname}:${SERVER_PORT}`,
    room: CHECK_ROOM,
    onOpen: () => setStatus("connected"),
    onClose: () => setStatus("disconnected"),
  });

  return (
    <main className="container py-5 text-center">
      <h1 className="display-4" style={{ fontFamily: '"ZCOOL KuaiLe", sans-serif' }}>
        Dice Kingdom Clash Online
      </h1>
      <p className="lead">Project scaffold</p>
      <span className={`badge fs-5 ${STATUS_BADGE[status]}`} data-testid="server-status">
        Server: {STATUS_LABEL[status]}
      </span>
      <div className="mt-4">
        <img src="/assets/cannon-dice/6.png" alt="Cannon dice showing 6" width={64} height={64} />
      </div>
    </main>
  );
}
