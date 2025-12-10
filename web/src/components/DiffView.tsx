import type { DiffLineAnnotation } from "@pierre/precision-diffs/react";
import { MultiFileDiff } from "@pierre/precision-diffs/react";
import type { ReactNode } from "react";
import type { Comment, FileDiff, Note } from "../api/types";
import type { CommentThread } from "../types/commentThread";
import { CommentThreadList } from "./CommentThread";

interface AnnotationData {
  type: "comment" | "note";
  comment?: Comment;
  note?: Note;
}

interface DiffViewProps {
  file: FileDiff;
  comments: Comment[];
  commentThreads: CommentThread[];
  notes: Note[];
  diffStyle: "split" | "unified";
  onResolveComment: (id: string) => void;
  onDismissNote: (id: string) => void;
  onLineClick?: (lineNumber: number, content: string) => void;
}

export function DiffView({
  file,
  comments,
  commentThreads,
  notes,
  diffStyle,
  onResolveComment,
  onDismissNote,
  onLineClick,
}: DiffViewProps) {
  // Build annotations from comments and notes
  const lineAnnotations: DiffLineAnnotation<AnnotationData>[] = [];

  // Add comments
  for (const comment of comments.filter((c) => !c.resolved)) {
    if (comment.line_number !== undefined) {
      lineAnnotations.push({
        side: "additions",
        lineNumber: comment.line_number,
        metadata: { type: "comment", comment },
      });
    }
  }

  // Add notes
  for (const note of notes.filter((n) => !n.dismissed)) {
    lineAnnotations.push({
      side: "additions",
      lineNumber: note.line_number,
      metadata: { type: "note", note },
    });
  }

  const renderAnnotation = (annotation: DiffLineAnnotation<AnnotationData>): ReactNode => {
    const { metadata } = annotation;

    if (metadata.type === "comment" && metadata.comment) {
      const comment = metadata.comment;
      const threadsForLine = commentThreads.filter(
        (thread) => thread.comment.line_number === comment.line_number,
      );
      return (
        <div className="annotation comment-annotation">
          <CommentThreadList
            threads={threadsForLine}
            onResolve={onResolveComment}
            variant="inline"
          />
        </div>
      );
    }

    if (metadata.type === "note" && metadata.note) {
      const note = metadata.note;
      return (
        <div className={`annotation note-annotation note-${note.type}`}>
          <div className="annotation-content">{note.text}</div>
          <div className="annotation-footer">
            <span className="annotation-meta">
              <span className="note-type-badge">{note.type}</span>
              <span className="note-author">@{note.author}</span>
            </span>
            <button
              type="button"
              className="annotation-action"
              onClick={() => onDismissNote(note.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  // Need at least one file for diff rendering
  if (!file.old_file && !file.new_file) {
    // No file contents loaded yet - show patch if available, otherwise loading state
    if (file.patch) {
      return (
        <div className="diff-fallback">
          <pre>{file.patch}</pre>
        </div>
      );
    }
    return (
      <div className="diff-loading">
        <span>No diff content available</span>
      </div>
    );
  }

  const oldFile = file.old_file ?? { name: file.path, contents: "" };
  const newFile = file.new_file ?? { name: file.path, contents: "" };

  const customCSS = `
		:host {
			--pjs-font-size: 14px;
			--pjs-line-height: 22px;
		}
	`;

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
      options={{
        theme: "pierre-dark",
        diffStyle,
        diffIndicators: "bars",
        overflow: "wrap",
        unsafeCSS: customCSS,
        onLineClick: onLineClick
          ? (props) => {
              const lines = (newFile.contents ?? "").split("\n");
              const content = lines[props.lineNumber - 1]?.trim() ?? "";
              onLineClick(props.lineNumber, content);
            }
          : undefined,
      }}
    />
  );
}
