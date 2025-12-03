import { useCallback, useEffect, useState } from "react";
import type { Comment, DiffResponse, FileDiff } from "../api/types";

type DiffMode = "branch" | "working" | "staged";

interface UseDiffResult {
	diff: DiffResponse | null;
	comments: Comment[];
	loading: boolean;
	error: string | null;
	mode: DiffMode;
	setMode: (mode: DiffMode) => void;
	refresh: () => Promise<void>;
	loadFileDiff: (filePath: string) => Promise<FileDiff | null>;
	toggleViewed: (filePath: string, viewed: boolean) => Promise<void>;
	addComment: (
		filePath: string,
		lineNumber: number,
		text: string,
		lineContent?: string,
	) => Promise<void>;
	resolveComment: (commentId: string) => Promise<void>;
	stageFile: (filePath: string) => Promise<void>;
	unstageFile: (filePath: string) => Promise<void>;
	discardFile: (filePath: string) => Promise<void>;
	commit: (message: string) => Promise<void>;
}

export function useDiff(repoId?: string | null): UseDiffResult {
	const [diff, setDiff] = useState<DiffResponse | null>(null);
	const [comments, setComments] = useState<Comment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<DiffMode>("branch");

	const buildUrl = useCallback(
		(path: string, params: Record<string, string> = {}) => {
			const url = new URL(path, window.location.origin);
			if (repoId) {
				url.searchParams.set("repo", repoId);
			}
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
			return url.pathname + url.search;
		},
		[repoId],
	);

	const fetchData = useCallback(
		async (currentMode: DiffMode) => {
			if (!repoId) {
				setLoading(false);
				setDiff(null);
				return;
			}

			try {
				setLoading(true);
				const fetches: Promise<Response>[] = [
					fetch(buildUrl("/api/diff", { mode: currentMode })),
					fetch(buildUrl("/api/comments", { mode: currentMode })),
				];

				// In working mode, also fetch staged files to mark them
				if (currentMode === "working") {
					fetches.push(fetch(buildUrl("/api/diff", { mode: "staged" })).catch(() => ({ ok: false }) as Response));
				}

				const [diffRes, commentsRes, stagedRes] = await Promise.all(fetches);

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

				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load");
			} finally {
				setLoading(false);
			}
		},
		[repoId, buildUrl],
	);

	useEffect(() => {
		void fetchData(mode);
	}, [mode, fetchData, repoId]);

	// Auto-refresh comments every 3s
	useEffect(() => {
		if (!repoId) return;

		const interval = setInterval(() => {
			fetch(buildUrl("/api/comments", { mode }))
				.then(async (commentsRes) => {
					if (commentsRes.ok) {
						setComments((await commentsRes.json()) as Comment[]);
					}
				})
				.catch(() => {
					/* ignore */
				});
		}, 3000);
		return () => {
			clearInterval(interval);
		};
	}, [mode, repoId, buildUrl]);

	const refresh = useCallback(() => fetchData(mode), [mode, fetchData]);

	const loadFileDiff = useCallback(
		async (filePath: string): Promise<FileDiff | null> => {
			try {
				const res = await fetch(buildUrl("/api/file-diff", { mode, file: filePath }));
				if (!res.ok) return null;
				const fileDiff = (await res.json()) as FileDiff;

				// Update the file in the diff state with the full data
				setDiff((prev) =>
					prev
						? {
								...prev,
								files: prev.files.map((f) =>
									f.path === filePath ? { ...f, ...fileDiff } : f,
								),
							}
						: null,
				);

				return fileDiff;
			} catch {
				return null;
			}
		},
		[mode, buildUrl],
	);

	const toggleViewed = useCallback(
		async (filePath: string, currentlyViewed: boolean) => {
			const endpoint = currentlyViewed ? "/api/unmark-viewed" : "/api/mark-viewed";
			const res = await fetch(buildUrl(endpoint), {
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
		},
		[buildUrl],
	);

	const addComment = useCallback(
		async (filePath: string, lineNumber: number, text: string, lineContent?: string) => {
			const commentText = lineContent ? `[context: \`${lineContent}\`]\n${text}` : text;
			const res = await fetch(buildUrl("/api/comments"), {
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
		[buildUrl],
	);

	const resolveComment = useCallback(
		async (commentId: string) => {
			const res = await fetch(buildUrl("/api/comments/resolve"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ comment_id: commentId }),
			});
			if (!res.ok) {
				throw new Error("Failed to resolve");
			}
			setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)));
		},
		[buildUrl],
	);

	const stageFile = useCallback(
		async (filePath: string) => {
			const res = await fetch(buildUrl("/api/stage"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to stage");
			}
			await fetchData(mode);
		},
		[mode, fetchData, buildUrl],
	);

	const unstageFile = useCallback(
		async (filePath: string) => {
			const res = await fetch(buildUrl("/api/unstage"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to unstage");
			}
			await fetchData(mode);
		},
		[mode, fetchData, buildUrl],
	);

	const discardFile = useCallback(
		async (filePath: string) => {
			const res = await fetch(buildUrl("/api/discard"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file_path: filePath }),
			});
			if (!res.ok) {
				throw new Error("Failed to discard");
			}
			await fetchData(mode);
		},
		[mode, fetchData, buildUrl],
	);

	const commit = useCallback(
		async (message: string) => {
			const res = await fetch(buildUrl("/api/commit"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message }),
			});
			if (!res.ok) {
				throw new Error("Failed to commit");
			}
			await fetchData(mode);
		},
		[mode, fetchData, buildUrl],
	);

	return {
		diff,
		comments,
		loading,
		error,
		mode,
		setMode,
		refresh,
		loadFileDiff,
		toggleViewed,
		addComment,
		resolveComment,
		stageFile,
		unstageFile,
		discardFile,
		commit,
	};
}
