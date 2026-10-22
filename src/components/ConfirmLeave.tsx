import Modal from "./Modal.tsx";

interface ConfirmLeaveProps {
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation shown before a player forfeits an active match. */
export default function ConfirmLeave({ onConfirm, onClose }: ConfirmLeaveProps) {
  return (
    <Modal
      footer={
        <>
          <button className="btn btn-outline-secondary" onClick={onClose} type="button">
            Stay
          </button>
          <button className="btn btn-danger" onClick={onConfirm} type="button">
            Leave
          </button>
        </>
      }
      onClose={onClose}
      title="Leave match?"
    >
      <p className="mb-0">Leave the match? Your opponent wins.</p>
    </Modal>
  );
}
