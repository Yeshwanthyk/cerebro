import type { DiffLineAnnotation } from "@pierre/precision-diffs/react";
import { MultiFileDiff } from "@pierre/precision-diffs/react";
import type { ReactNode } from "react";
import type { Comment, FileDiff, Note } from "../api/types";

interface AnnotationData {
	type: "comment" | "note";
	comment?: Comment;
	note?: Note;
}

interface DiffViewProps {
	file: FileDiff;
	comments: Comment[];
	notes: Note[];
	showNotes: boolean;
	diffStyle: "split" | "unified";
	onResolveComment: (id: string) => void;
	onDismissNote: (id: string) => void;
	onLineClick?: (lineNumber: number, content: string) => void;
}

export function DiffView({
	file,
	comments,
	notes,
	showNotes,
	diffStyle,
	onResolveComment,
	onDismissNote,
	onLineClick,
}: DiffViewProps) {
	// Build annotations from comments and notes
	const lineAnnotations: DiffLineAnnotation<AnnotationData>[] = [];

	// Add comments
	for (const comment of comments.filter((c) => !c.resolved)) {
		if (comment.line_number != null) {
			lineAnnotations.push({
				side: "additions",
				lineNumber: comment.line_number,
				metadata: { type: "comment", comment },
			});
		}
	}

	// Add notes if visible
	if (showNotes) {
		for (const note of notes.filter((n) => !n.dismissed)) {
			lineAnnotations.push({
				side: "additions",
				lineNumber: note.line_number,
				metadata: { type: "note", note },
			});
		}
	}

	const renderAnnotation = (annotation: DiffLineAnnotation<AnnotationData>): ReactNode => {
		const { metadata } = annotation;

		if (metadata.type === "comment" && metadata.comment) {
			const comment = metadata.comment;
			return (
				<div className="annotation comment-annotation">
					<div className="annotation-content">{comment.text}</div>
					<div className="annotation-footer">
						<span className="annotation-time">
							{new Date(comment.timestamp * 1000).toLocaleString()}
						</span>
						<button
							type="button"
							className="annotation-action"
							onClick={() => {
								onResolveComment(comment.id);
							}}
						>
							Resolve
						</button>
					</div>
				</div>
			);
		}

		if (metadata.type === "note" && metadata.note) {
			const note = metadata.note;
			return (
				<div className={`annotation note-annotation note-${note.type}`}>
					<div className="annotation-header">
						<span className="note-author">{note.author}</span>
						<span className="note-type">{note.type}</span>
					</div>
					<div className="annotation-content">{note.text}</div>
					<button
						type="button"
						className="annotation-dismiss"
						onClick={() => {
							onDismissNote(note.id);
						}}
					>
						dismiss
					</button>
				</div>
			);
		}

		return null;
	};

	// Need both old and new file for diff
	if (!file.old_file && !file.new_file) {
		// Fallback: show patch as text
		return (
			<div className="diff-fallback">
				<pre>{file.patch}</pre>
			</div>
		);
	}

	const oldFile = file.old_file ?? { name: file.path, contents: "" };
	const newFile = file.new_file ?? { name: file.path, contents: "" };

	const fontCSS = `
		@font-face {
			font-family: "Berkeley Mono";
			src: url("/fonts/BerkeleyMonoNerdFont-Regular.otf") format("opentype");
			font-weight: 400;
			font-style: normal;
		}
		@font-face {
			font-family: "Berkeley Mono";
			src: url("/fonts/BerkeleyMonoNerdFont-Bold.otf") format("opentype");
			font-weight: 700;
			font-style: normal;
		}
		:host {
			--pjs-font-family: "Berkeley Mono", monospace;
			--pjs-font-size: 15px;
			--pjs-line-height: 24px;
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
				unsafeCSS: fontCSS,
				onLineClick: onLineClick
					? (props) => {
							const lines = (newFile.contents || "").split("\n");
							const content = lines[props.lineNumber - 1]?.trim() || "";
							onLineClick(props.lineNumber, content);
						}
					: undefined,
			}}
		/>
	);
}
