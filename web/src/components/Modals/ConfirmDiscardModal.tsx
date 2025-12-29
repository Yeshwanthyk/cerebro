import { Modal } from "../Modal";
import "./Modals.css";

interface ConfirmDiscardModalProps {
  filePath: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDiscardModal({ filePath, onClose, onConfirm }: ConfirmDiscardModalProps) {
  return (
    <Modal onClose={onClose} className="confirm-modal">
      <p>
        Discard changes to <strong>{filePath}</strong>?
      </p>
      <p className="muted">This cannot be undone.</p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          Discard
        </button>
      </div>
    </Modal>
  );
}
