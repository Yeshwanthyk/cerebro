import "./Progress.css";

interface ProgressProps {
  viewedCount: number;
  totalCount: number;
}

export function Progress({ viewedCount, totalCount }: ProgressProps) {
  if (totalCount === 0) return null;

  const progressPercent = (viewedCount / totalCount) * 100;

  return (
    <div className="progress">
      <span>
        <strong>{viewedCount}</strong> of {totalCount} files reviewed
      </span>
      <span className="shortcut-hint">Press ⌘K for commands, ? for shortcuts</span>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${String(progressPercent)}%` }} />
      </div>
    </div>
  );
}
