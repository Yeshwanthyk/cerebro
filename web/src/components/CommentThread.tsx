import type { CommentThread as CommentThreadType } from "../types/commentThread";

interface CommentThreadListProps {
  threads: CommentThreadType[];
  onResolve: (id: string) => void;
  variant?: "panel" | "inline";
}

interface CommentThreadItemProps {
  thread: CommentThreadType;
  depth: number;
  onResolve: (id: string) => void;
  variant: "panel" | "inline";
}

export function CommentThreadList({ threads, onResolve, variant = "panel" }: CommentThreadListProps) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <div className={`comment-thread-list comment-thread-${variant}`}>
      {threads.map((thread) => (
        <CommentThreadItem
          key={thread.comment.id}
          thread={thread}
          depth={0}
          onResolve={onResolve}
          variant={variant}
        />
      ))}
    </div>
  );
}

function CommentThreadItem({ thread, depth, onResolve, variant }: CommentThreadItemProps) {
  const { comment, replies } = thread;
  const isRoot = depth === 0;
  const showResolve = !comment.resolved;
  const timeLabel = new Date(comment.timestamp * 1000).toLocaleString();

  return (
    <div className={`comment-thread depth-${depth}`} style={{ marginLeft: isRoot ? 0 : depth * 14 }}>
      <div className={`comment-card ${variant === "inline" ? "comment-card-inline" : ""}`}>
        <div className="comment-text">{comment.text}</div>
        <div className="comment-footer">
          <span className="comment-time">{timeLabel}</span>
          {showResolve && (
            <button type="button" className="resolve-btn" onClick={() => onResolve(comment.id)}>
              Resolve
            </button>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="comment-children">
          {replies.map((child) => (
            <CommentThreadItem
              key={child.comment.id}
              thread={child}
              depth={depth + 1}
              onResolve={onResolve}
              variant={variant}
            />
          ))}
        </div>
      )}
    </div>
  );
}
