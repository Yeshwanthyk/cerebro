import { useState, useCallback } from "react";

interface CommitBoxProps {
  stagedCount: number;
  onStageAll: () => void;
  onCommit: (message: string) => void;
}

const COMMIT_TYPES = ["feat", "fix", "docs", "style", "refactor", "test", "chore"];

export function CommitBox({ stagedCount, onStageAll, onCommit }: CommitBoxProps) {
  const [message, setMessage] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const handleCommit = useCallback(() => {
    if (!message.trim()) return;
    const fullMessage = selectedType ? `${selectedType}: ${message}` : message;
    onCommit(fullMessage);
    setMessage("");
    setSelectedType(null);
  }, [message, selectedType, onCommit]);

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
      <div className="commit-type-row">
        {COMMIT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`commit-type-btn ${selectedType === type ? "active" : ""}`}
            onClick={() => setSelectedType(selectedType === type ? null : type)}
          >
            {type}
          </button>
        ))}
      </div>
      <textarea
        className="commit-input"
        placeholder="Describe this change..."
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
