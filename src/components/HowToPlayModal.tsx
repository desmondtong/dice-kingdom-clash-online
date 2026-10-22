import Modal from "./Modal.tsx";

interface HowToPlayModalProps {
  onClose: () => void;
}

/** Concise tutorial for the authoritative online rules, not the original local-game rules. */
export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <Modal onClose={onClose} title="How To Play">
      <div className="tutorial-copy">
        <p>
          Each player starts with <strong>50 HP</strong>. Seat 1 is on the left and takes the first
          turn in the first match.
        </p>
        <h3 className="h5">Fire the cannon</h3>
        <p>
          Roll the two cannon dice on your turn. Their values are multiplied together for the attack
          damage.
        </p>
        <h3 className="h5">Use Power Dice</h3>
        <ul>
          <li>
            <strong>Shield:</strong> halve the next damage your tower takes, rounded up.
          </li>
          <li>
            <strong>Ricochet:</strong> your opponent&apos;s next cannon attack hits their own tower
            instead.
          </li>
          <li>
            <strong>Heal:</strong> restore HP, up to 50 HP.
          </li>
          <li>
            <strong>Swap:</strong> swap both towers&apos; current HP. Shield and Ricochet stay with
            their owners.
          </li>
        </ul>
        <p>
          Power Dice appear in rounds 3 and 6. Every step has a 10-second timer: an unanswered Power
          Dice step auto-rolls, while an unanswered cannon step is skipped.
        </p>
        <p>
          A match lasts up to 8 rounds. Knock out a tower to win immediately; otherwise the higher
          HP wins after round 8, and equal HP is a tie. There is no pause. On a rematch, the first
          seat alternates.
        </p>
      </div>
    </Modal>
  );
}
