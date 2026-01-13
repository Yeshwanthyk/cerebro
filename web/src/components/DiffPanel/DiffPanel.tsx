import type { Comment, DiffMode, FileDiff, Note } from "../../api/types";
import type { CommentThread } from "../../types/commentThread";
import { DiffHeader } from "./DiffHeader";
import { WelcomePanel } from "./WelcomePanel";
import { DiffView } from "../DiffView";
import { CommentThreadList } from "../CommentThread";
import "./DiffPanel.css";

interface DiffPanelProps {
  file: FileDiff | null;
  files: FileDiff[];
  mode: DiffMode;
  viewMode: "patch" | "full";
  diffStyle: "split" | "unified";
  isLoading: boolean;
  comments: Comment[];
  commentThreads: CommentThread[];
  notes: Note[];
  onToggleViewMode: () => void;
  onToggleDiffStyle: () => void;
  onToggleViewed: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onResolveComment: (id: string) => void;
}

export function DiffPanel({
  file,
  files,
  mode,
  viewMode,
  diffStyle,
  isLoading,
  comments: _comments,
  commentThreads,
  notes,
  onToggleViewMode,
  onToggleDiffStyle,
  onToggleViewed,
  onStage,
  onUnstage,
  onDiscard,
  onResolveComment,
}: DiffPanelProps) {
  // No file selected
  if (!file) {
    return <WelcomePanel hasFiles={files.length > 0} />;
  }

  const fileLevelThreads = commentThreads.filter(
    (thread) => thread.comment.line_number === undefined,
  );
  const activeNotes = notes.filter((n) => !n.dismissed);

  // Suppress unused variable warning - comments prop is required for future inline comments
  void _comments;

  return (
    <div className="diff-panel">
      <DiffHeader
        file={file}
        mode={mode}
        viewMode={viewMode}
        diffStyle={diffStyle}
        onToggleViewMode={onToggleViewMode}
        onToggleDiffStyle={onToggleDiffStyle}
        onToggleViewed={onToggleViewed}
        onStage={onStage}
        onUnstage={onUnstage}
        onDiscard={onDiscard}
      />

      {/* File-level comments */}
      {fileLevelThreads.length > 0 && (
        <div className="diff-panel-comments">
          <CommentThreadList
            threads={fileLevelThreads}
            onResolve={onResolveComment}
            variant="panel"
          />
        </div>
      )}

      {/* File-level notes */}
      {activeNotes.length > 0 && (
        <div className="diff-panel-notes">
          {activeNotes.map((note) => (
            <div key={note.id} className={`file-note note-${note.type}`}>
              <div className="note-header">
                <span className="note-type">{note.type}</span>
                {note.author && <span className="note-author">by {note.author}</span>}
              </div>
              <div className="note-text">{note.text}</div>
              {note.line_number && (
                <div className="note-footer">
                  <span className="note-line">Line {note.line_number}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diff content */}
      <div className="diff-panel-content">
        {isLoading ? (
          <div className="diff-loading">Loading diff...</div>
        ) : (
          <DiffView file={file} diffStyle={diffStyle} viewMode={viewMode} />
        )}
      </div>
    </div>
  );
}
