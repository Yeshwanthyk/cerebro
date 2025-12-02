import type { DiffLineAnnotation } from "@pierre/precision-diffs/react";
import { MultiFileDiff } from "@pierre/precision-diffs/react";
import type { ReactNode } from "react";
import type { Comment, FileDiff } from "../api/types";

interface AnnotationData {
	type: "comment";
	comment?: Comment;
}

interface DiffViewProps {
	file: FileDiff;
	comments: Comment[];
	diffStyle: "split" | "unified";
	onResolveComment: (id: string) => void;
	onLineClick?: (lineNumber: number, content: string) => void;
}

export function DiffView({
	file,
	comments,
	diffStyle,
	onResolveComment,
	onLineClick,
}: DiffViewProps) {
	// Build annotations from comments
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
							const lines = (newFile.contents || "").split("\n");
							const content = lines[props.lineNumber - 1]?.trim() || "";
							onLineClick(props.lineNumber, content);
						}
					: undefined,
			}}
		/>
	);
}
