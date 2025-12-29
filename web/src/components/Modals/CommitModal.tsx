import { useState } from "react";
import { Modal } from "../Modal";
import type { FileDiff } from "../../api/types";
import "./Modals.css";

interface CommitModalProps {
  stagedFiles: FileDiff[];
  onClose: () => void;
  onCommit: (message: string) => void;
}

const COMMIT_TYPES = ["feat", "fix", "chore", "docs", "refactor", "test"] as const;

export function CommitModal({ stagedFiles, onClose, onCommit }: CommitModalProps) {
  const [message, setMessage] = useState("");

  const handleCommit = () => {
    if (message.trim()) {
      onCommit(message.trim());
    }
  };

  const setCommitType = (type: string) => {
    const msg = message.replace(/^(feat|fix|chore|docs|refactor|test):\s*/, "");
    setMessage(`${type}: ${msg}`);
  };

  return (
    <Modal onClose={onClose} className="commit-modal" aria-labelledby="commit-title">
      <h3 id="commit-title">Commit Changes</h3>
      <div className="commit-files">
        <span className="commit-files-count">
          {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} staged
        </span>
        <ul>
          {stagedFiles.map((f) => (
            <li key={f.path}>
              <span className={`status-dot ${f.status}`} />
              {f.path}
            </li>
          ))}
        </ul>
      </div>
      <div className="commit-type-buttons">
        {COMMIT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={message.startsWith(`${type}: `) ? "active" : ""}
            onClick={() => setCommitType(type)}
          >
            {type}
          </button>
        ))}
      </div>
      <textarea
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            handleCommit();
          }
        }}
      />
      <div className="modal-actions">
        <span className="modal-hint">⌘+Enter to commit</span>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!message.trim()}
          onClick={handleCommit}
        >
          Commit
        </button>
      </div>
    </Modal>
  );
}
