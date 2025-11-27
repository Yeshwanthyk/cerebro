import { useCallback, useEffect, useState } from "react";
import type { Comment, DiffResponse, Note } from "../api/types";

type DiffMode = "branch" | "working" | "staged";

interface UseDiffResult {
	diff: DiffResponse | null;
	comments: Comment[];
	notes: Note[];
	loading: boolean;
	error: string | null;
	mode: DiffMode;
	setMode: (mode: DiffMode) => void;
	refresh: () => Promise<void>;
	toggleViewed: (filePath: string, viewed: boolean) => Promise<void>;
	addComment: (
		filePath: string,
		lineNumber: number,
		text: string,
		lineContent?: string,
	) => Promise<void>;
	resolveComment: (commentId: string) => Promise<void>;
	dismissNote: (noteId: string) => Promise<void>;
	stageFile: (filePath: string) => Promise<void>;
	unstageFile: (filePath: string) => Promise<void>;
	discardFile: (filePath: string) => Promise<void>;
	commit: (message: string) => Promise<void>;
}

export function useDiff(): UseDiffResult {
	const [diff, setDiff] = useState<DiffResponse | null>(null);
	const [comments, setComments] = useState<Comment[]>([]);
	const [notes, setNotes] = useState<Note[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<DiffMode>("branch");

	const fetchData = useCallback(async (currentMode: DiffMode) => {
		try {
			const modeParam = `?mode=${currentMode}`;
			const fetches: Promise<Response>[] = [
				fetch(`/api/diff${modeParam}`),
				fetch(`/api/comments${modeParam}`),
				fetch(`/api/notes${modeParam}`).catch(() => ({ ok: false }) as Response),
			];

			// In working mode, also fetch staged files to mark them
			if (currentMode === "working") {
				fetches.push(fetch("/api/diff?mode=staged").catch(() => ({ ok: false }) as Response));
			}

			const [diffRes, commentsRes, notesRes, stagedRes] = await Promise.all(fetches);

			if (!diffRes.ok) {
				throw new Error(await diffRes.text());
			}

			let diffData = (await diffRes.json()) as DiffResponse;

			// Mark files that are also staged
			if (currentMode === "working" && stagedRes?.ok) {
				const stagedData = (await stagedRes.json()) as DiffResponse;
				const stagedPaths = new Set(stagedData.files.map((f) => f.path));
				diffData = {
					...diffData,
					files: diffData.files.map((f) => ({
						...f,
						staged: stagedPaths.has(f.path),
					})),
				};
			}

			setDiff(diffData);

			if (commentsRes.ok) {
				setComments((await commentsRes.json()) as Comment[]);
			}

			if (notesRes.ok) {
				setNotes((await notesRes.json()) as Note[]);
			}

			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchData(mode);
	}, [mode, fetchData]);

	// Auto-refresh comments/notes every 3s
	useEffect(() => {
		const interval = setInterval(() => {
			const modeParam = `?mode=${mode}`;
			Promise.all([
				fetch(`/api/comments${modeParam}`),
				fetch(`/api/notes${modeParam}`).catch(() => ({ ok: false }) as Response),
			])
				.then(async ([commentsRes, notesRes]) => {
					if (commentsRes.ok) {
						setComments((await commentsRes.json()) as Comment[]);
					}
					if (notesRes.ok) {
						setNotes((await notesRes.json()) as Note[]);
					}
				})
				.catch(() => {
					/* ignore */
				});
		}, 3000);
		return () => {
			clearInterval(interval);
		};
	}, [mode]);

	const refresh = useCallback(() => fetchData(mode), [mode, fetchData]);

	const toggleViewed = useCallback(async (filePath: string, currentlyViewed: boolean) => {
		const endpoint = currentlyViewed ? "/api/unmark-viewed" : "/api/mark-viewed";
		const res = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ file_path: filePath }),
		});
		if (!res.ok) {
			throw new Error("Failed to update");
		}
		setDiff((prev) =>
			prev
				? {
						...prev,
						files: prev.files.map((f) =>
							f.path === filePath ? { ...f, viewed: !currentlyViewed } : f,
						),
					}
				: null,
		);
	}, []);

	const addComment = useCallback(
		async (filePath: string, lineNumber: number, text: string, lineContent?: string) => {
			const commentText = lineContent ? `[context: \`${lineContent}\`]\n${text}` : text;
			const res = await fetch("/api/comments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath, line_number: lineNumber, text: commentText }),
			});
			if (!res.ok) {
				throw new Error("Failed to add comment");
			}
			const newComment = (await res.json()) as Comment;
			setComments((prev) => [...prev, newComment]);
		},
		[],
	);

	const resolveComment = useCallback(async (commentId: string) => {
		const res = await fetch("/api/comments/resolve", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ comment_id: commentId }),
		});
		if (!res.ok) {
			throw new Error("Failed to resolve");
		}
		setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)));
	}, []);

	const dismissNote = useCallback(async (noteId: string) => {
		await fetch("/api/notes/dismiss", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ note_id: noteId }),
		});
		// Remove dismissed note from local state since server filters it out
		setNotes((prev) => prev.filter((n) => n.id !== noteId));
	}, []);

	const stageFile = useCallback(
		async (filePath: string) => {
			const res = await fetch("/api/stage", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to stage");
			}
			await fetchData(mode);
		},
		[mode, fetchData],
	);

	const unstageFile = useCallback(
		async (filePath: string) => {
			const res = await fetch("/api/unstage", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to unstage");
			}
			await fetchData(mode);
		},
		[mode, fetchData],
	);

	const discardFile = useCallback(
		async (filePath: string) => {
			const res = await fetch("/api/discard", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to discard");
			}
			await fetchData(mode);
		},
		[mode, fetchData],
	);

	const commit = useCallback(
		async (message: string) => {
			const res = await fetch("/api/commit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message }),
			});
			if (!res.ok) {
				throw new Error("Failed to commit");
			}
			await fetchData(mode);
		},
		[mode, fetchData],
	);

	return {
		diff,
		comments,
		notes,
		loading,
		error,
		mode,
		setMode,
		refresh,
		toggleViewed,
		addComment,
		resolveComment,
		dismissNote,
		stageFile,
		unstageFile,
		discardFile,
		commit,
	};
}
