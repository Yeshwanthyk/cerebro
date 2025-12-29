import { useState } from "react";
import { Modal } from "../Modal";
import "./Modals.css";

interface CommentModalProps {
  lineNumber: number;
  lineContent: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

export function CommentModal({ lineNumber, lineContent, onClose, onSubmit }: CommentModalProps) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
    }
  };

  return (
    <Modal onClose={onClose} className="comment-modal" aria-labelledby="comment-title">
      <h3 id="comment-title">Comment on line {lineNumber}</h3>
      {lineContent && <pre className="code-preview">{lineContent}</pre>}
      <textarea
        placeholder="Write your comment..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
          }
        }}
      />
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={!text.trim()}>
          Comment
        </button>
      </div>
    </Modal>
  );
}
