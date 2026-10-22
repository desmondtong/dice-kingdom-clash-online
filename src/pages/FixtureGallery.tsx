import { Link } from "react-router";
import { fixtures } from "../../shared/fixtures/index.ts";

export default function FixtureGallery() {
  return (
    <main className="room-shell">
      <h1>Room fixture gallery</h1>
      <p>Recorded server snapshots. No PartyKit connection is opened.</p>
      <p>
        <Link to="/room/KX7P?mock=demo&seat=1">Scripted demo · seat 1</Link> /{" "}
        <Link to="/room/KX7P?mock=demo&seat=2">seat 2</Link>
      </p>
      <ul>
        {Object.keys(fixtures).map((name) => (
          <li key={name}>
            {name}: <Link to={`/room/KX7P?mock=${name}&seat=1`}>Seat 1</Link> /{" "}
            <Link to={`/room/KX7P?mock=${name}&seat=2`}>Seat 2</Link>
          </li>
        ))}
      </ul>
      <Link to="/">Back to Home</Link>
    </main>
  );
}
