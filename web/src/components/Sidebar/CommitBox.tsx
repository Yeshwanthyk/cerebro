import { useState, useCallback } from "react";

interface CommitBoxProps {
  stagedCount: number;
  onStageAll: () => void;
  onCommit: (message: string) => void;
}

export function CommitBox({ stagedCount, onStageAll, onCommit }: CommitBoxProps) {
  const [message, setMessage] = useState("");

  const handleCommit = useCallback(() => {
    if (!message.trim()) return;
    onCommit(message);
    setMessage("");
  }, [message, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  return (
    <div className="commit-box">
      <textarea
        className="commit-input"
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
      />
      <div className="commit-actions">
        <button type="button" className="stage-all-btn" onClick={onStageAll}>
          Stage All
        </button>
        <button
          type="button"
          className="commit-btn-primary"
          onClick={handleCommit}
          disabled={stagedCount === 0 || !message.trim()}
        >
          Commit
        </button>
      </div>
    </div>
  );
}
