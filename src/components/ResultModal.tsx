import type { ClientMessage, RoomState, Seat } from "../../shared/types.ts";
import { opponent } from "../../shared/protocol.ts";
import Modal from "./Modal.tsx";

interface ResultModalProps {
  state: RoomState;
  seat: Seat;
  disabled: boolean;
  onIntent: (intent: ClientMessage) => void;
  onHome: () => void;
}

function resultHeading(state: RoomState, seat: Seat): string {
  const result = state.result;
  if (!result || result.winner === "tie") return "It’s a tie!";
  if (result.reason === "left" && result.winner === seat) return "Opponent left, you win";
  return result.winner === seat ? "You win!" : "You lose";
}

function resultReason(state: RoomState): string {
  switch (state.result?.reason) {
    case "ko":
      return "Knockout";
    case "rounds":
      return "After 8 rounds";
    case "left":
      return "Opponent left the match";
    default:
      return "Match complete";
  }
}

/** Shows an authoritative result; it never infers the winner from client-side HP. */
export default function ResultModal({ state, seat, disabled, onIntent, onHome }: ResultModalProps) {
  const opponentSeat = opponent(seat);
  const opponentPlayer = state.players[opponentSeat];
  const ownPlayer = state.players[seat];
  const ownVoted = state.rematchVotes.includes(seat);
  const opponentVoted = state.rematchVotes.includes(opponentSeat);
  const canOfferRematch =
    state.phase === "finished" &&
    state.result?.reason !== "left" &&
    Boolean(opponentPlayer) &&
    !ownVoted &&
    !disabled;
  const match = state.match;

  return (
    <Modal title="Match result">
      <div className="text-center" data-testid="result-modal">
        <h2 className="display-6">{resultHeading(state, seat)}</h2>
        <p className="lead">{resultReason(state)}</p>
        <dl className="row text-start mb-4">
          <dt className="col-7">{ownPlayer?.name ?? "You"} (You)</dt>
          <dd className="col-5 text-end" data-testid="your-final-hp">
            {match?.towers[seat].hp ?? "—"} HP
          </dd>
          <dt className="col-7">{opponentPlayer?.name ?? "Opponent"}</dt>
          <dd className="col-5 text-end" data-testid="opponent-final-hp">
            {match?.towers[opponentSeat].hp ?? "—"} HP
          </dd>
        </dl>

        {opponentPlayer && state.result?.reason !== "left" ? (
          <section aria-label="Rematch status" className="mb-3">
            <p className="mb-3" role="status">
              {opponentVoted
                ? "Opponent is ready for a rematch."
                : "Opponent has not voted for a rematch yet."}
            </p>
            <button
              className="btn btn-success"
              disabled={!canOfferRematch}
              onClick={() => onIntent({ type: "rematch" })}
              type="button"
            >
              {ownVoted ? "Waiting for opponent" : "Rematch"}
            </button>
          </section>
        ) : null}

        <button className="btn btn-outline-primary" onClick={onHome} type="button">
          Back to Home
        </button>
      </div>
    </Modal>
  );
}
