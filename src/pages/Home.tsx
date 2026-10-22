import { useState } from "react";
import { useNavigate } from "react-router";
import { limitNameInput } from "../../shared/protocol.ts";
import HowToPlayModal from "../components/HowToPlayModal.tsx";
import {
  generateRoomCode,
  isRoomCode,
  loadNickname,
  normalizeRoomCode,
  saveNickname,
} from "../net/identity.ts";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(loadNickname);
  const [code, setCode] = useState("");
  const [tutorial, setTutorial] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const validName = name.trim().length > 0;
  const normalizedCode = normalizeRoomCode(code);
  const join = () => {
    setSubmitted(true);
    if (!validName || !isRoomCode(normalizedCode)) return;
    saveNickname(name);
    navigate(`/room/${normalizedCode}`, { state: { intent: "join", name } });
  };
  return (
    <main className="start-menu">
      <img className="logo" src="/assets/name-logo.png" alt="Dice Kingdom Clash" />
      <section className="home-card">
        <h1>Dice Kingdom Clash Online</h1>
        <p>Two towers. Two players. Let the dice decide.</p>
        <label htmlFor="nickname">Nickname</label>
        <input
          id="nickname"
          className="form-control"
          autoComplete="nickname"
          value={name}
          onChange={(event) => setName(limitNameInput(event.target.value))}
          placeholder="Your name (12 characters)"
        />
        <button
          className="btn btn-success start-btn"
          disabled={!validName}
          onClick={() => {
            saveNickname(name);
            navigate(`/room/${generateRoomCode()}`, { state: { intent: "create", name } });
          }}
        >
          Create Room
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            join();
          }}
        >
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            className="form-control room-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="KX7P"
            aria-describedby="code-help"
          />
          <p id="code-help">4 letters or numbers. No 0, O, 1, I or L.</p>
          {submitted && !isRoomCode(normalizedCode) && (
            <p role="alert">Enter a valid 4-character room code.</p>
          )}
          <button className="btn btn-success" disabled={!validName}>
            Join Room
          </button>
        </form>
        <button className="btn btn-secondary tutorial-btn" onClick={() => setTutorial(true)}>
          How To Play
        </button>
      </section>
      {tutorial && <HowToPlayModal onClose={() => setTutorial(false)} />}
    </main>
  );
}
