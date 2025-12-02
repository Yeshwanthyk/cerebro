import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCard } from "./components/FileCard";
import { RepoPicker } from "./components/RepoPicker";
import { useDiff } from "./hooks/useDiff";
import { useRepos } from "./hooks/useRepos";

type DiffMode = "branch" | "working" | "staged";

export default function App() {
	const {
		repos,
		currentRepo,
		loading: reposLoading,
		error: reposError,
		setCurrentRepo,
		addRepo,
		removeRepo,
	} = useRepos();

	const {
		diff,
		comments,
		loading,
		error,
		mode,
		setMode,
		toggleViewed,
		addComment,
		resolveComment,
		stageFile,
		unstageFile,
		discardFile,
		commit,
		loadFileDiff,
	} = useDiff(currentRepo);

	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
	const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [diffStyle, setDiffStyle] = useState<"split" | "unified">("unified");
	const [showShortcuts, setShowShortcuts] = useState(false);
	const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
	const [activeComment, setActiveComment] = useState<{
		filePath: string;
		lineNumber: number;
		content: string;
	} | null>(null);

	const files = useMemo(() => diff?.files ?? [], [diff?.files]);

	const toggleFile = useCallback(
		async (path: string) => {
			const file = files.find((f) => f.path === path);
			const isExpanding = !expandedFiles.has(path);

			// If expanding and file has no patch loaded (lazy loading), load it first
			if (isExpanding && file && !file.patch) {
				setLoadingFiles((prev) => new Set(prev).add(path));
				await loadFileDiff(path);
				setLoadingFiles((prev) => {
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
			}

			setExpandedFiles((prev) => {
				const next = new Set(prev);
				if (next.has(path)) {
					next.delete(path);
				} else {
					next.add(path);
				}
				return next;
			});
		},
		[expandedFiles, files, loadFileDiff],
	);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			switch (e.key) {
				case "j":
					setFocusedIndex((i) => Math.min(i + 1, files.length - 1));
					break;
				case "k":
					setFocusedIndex((i) => Math.max(i - 1, 0));
					break;
				case "o":
					if (files[focusedIndex]) {
						void toggleFile(files[focusedIndex].path);
					}
					break;
				case "1":
					setMode("branch");
					break;
				case "2":
					setMode("working");
					break;
				case "3":
					setMode("staged");
					break;
				case "?":
					setShowShortcuts((s) => !s);
					break;
				case "Escape":
					setShowShortcuts(false);
					setConfirmDiscard(null);
					setActiveComment(null);
					break;
			}
		};

		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("keydown", handleKey);
		};
	}, [files, focusedIndex, toggleFile, setMode]);

	const getCommentsForFile = (path: string) => (comments ?? []).filter((c) => c.file_path === path);

	const handleToggleViewed = async (path: string, viewed: boolean) => {
		try {
			await toggleViewed(path, viewed);
		} catch {
			// ignore
		}
	};

	const handleResolveComment = async (id: string) => {
		try {
			await resolveComment(id);
		} catch {
			// ignore
		}
	};

	const handleStage = async (path: string) => {
		try {
			await stageFile(path);
		} catch {
			// ignore
		}
	};

	const handleUnstage = async (path: string) => {
		try {
			await unstageFile(path);
		} catch {
			// ignore
		}
	};

	const handleDiscard = async (path: string) => {
		try {
			await discardFile(path);
			setConfirmDiscard(null);
		} catch {
			// ignore
		}
	};

	const handleCommit = async () => {
		const message = window.prompt("Commit message:");
		if (!message) {
			return;
		}
		try {
			await commit(message);
		} catch {
			// ignore
		}
	};

	const handleAddComment = async (text: string) => {
		if (!activeComment) {
			return;
		}
		try {
			await addComment(
				activeComment.filePath,
				activeComment.lineNumber,
				text,
				activeComment.content,
			);
			setActiveComment(null);
		} catch {
			// ignore
		}
	};

	const handleRepoSelect = async (id: string) => {
		try {
			await setCurrentRepo(id);
		} catch {
			// ignore
		}
	};

	const handleAddRepo = async (path: string) => {
		await addRepo(path);
	};

	const handleRemoveRepo = async (id: string) => {
		try {
			await removeRepo(id);
		} catch {
			// ignore
		}
	};

	// Show welcome screen if no repos
	if (!reposLoading && repos.length === 0) {
		return (
			<div className="welcome">
				<img src="/images/Cerebro.png" alt="Cerebro" className="welcome-logo" />
				<h1>Cerebro</h1>
				<p>Git diff review tool</p>
				<div className="welcome-content">
					<p>No repositories tracked yet.</p>
					<p className="muted">Add a repository to get started:</p>
					<RepoPicker
						repos={repos}
						currentRepo={currentRepo}
						onSelect={handleRepoSelect}
						onAdd={handleAddRepo}
						onRemove={handleRemoveRepo}
					/>
				</div>
			</div>
		);
	}

	if (reposLoading || loading) {
		return (
			<div className="loading">
				<img src="/images/Cerebro.png" alt="Cerebro" className="loading-logo" />
				<p><strong>Loading...</strong></p>
			</div>
		);
	}

	if (reposError || error) {
		return (
			<div className="error">
				<h2>Error</h2>
				<p>{reposError || error}</p>
			</div>
		);
	}

	const viewedCount = files.filter((f) => f.viewed).length;
	const fileCount = files.length;
	const progressPercent = fileCount > 0 ? (viewedCount / fileCount) * 100 : 0;

	return (
		<div className="app">
			<header className="header">
				<div className="header-left">
					<img src="/images/Cerebro.png" alt="Cerebro" className="header-logo" />
					<RepoPicker
						repos={repos}
						currentRepo={currentRepo}
						onSelect={handleRepoSelect}
						onAdd={handleAddRepo}
						onRemove={handleRemoveRepo}
					/>
					<span className="branch">{diff?.branch}</span>
					<span className="commit">{diff?.commit.slice(0, 7)}</span>
				</div>
				<div className="header-right">
					<div className="mode-switcher">
						{(["branch", "working", "staged"] as DiffMode[]).map((m) => (
							<button
								key={m}
								type="button"
								className={mode === m ? "active" : ""}
								onClick={() => {
									setMode(m);
								}}
							>
								{m.charAt(0).toUpperCase() + m.slice(1)}
							</button>
						))}
					</div>
					{mode === "staged" && fileCount > 0 && (
						<button type="button" className="commit-btn" onClick={() => void handleCommit()}>
							Commit
						</button>
					)}
					<button
						type="button"
						className={`view-toggle ${diffStyle === "split" ? "active" : ""}`}
						onClick={() => {
							setDiffStyle(diffStyle === "split" ? "unified" : "split");
						}}
						title="Toggle diff view"
					>
						{diffStyle === "split" ? "Split" : "Unified"}
					</button>
				</div>
			</header>

			{fileCount > 0 && (
				<div className="progress">
					<span>
						<strong>{viewedCount}</strong> of {fileCount} files reviewed
					</span>
					<span className="shortcut-hint">Press ? for shortcuts</span>
					<div className="progress-bar">
						<div className="progress-fill" style={{ width: `${String(progressPercent)}%` }} />
					</div>
				</div>
			)}

			<main className="file-list">
				{fileCount === 0 ? (
					<div className="empty">
						<p>No changes</p>
						<p className="muted">Your branch is up to date</p>
					</div>
				) : (
					files.map((file, index) => (
						<FileCard
							key={file.path}
							file={file}
							comments={getCommentsForFile(file.path)}
							diffStyle={diffStyle}
							isExpanded={expandedFiles.has(file.path)}
							isLoading={loadingFiles.has(file.path)}
							isFocused={index === focusedIndex}
							mode={mode}
							onToggle={() => {
								void toggleFile(file.path);
								setFocusedIndex(index);
							}}
							onToggleViewed={() => void handleToggleViewed(file.path, file.viewed)}
							onResolveComment={(id) => void handleResolveComment(id)}
							onStage={() => void handleStage(file.path)}
							onUnstage={() => void handleUnstage(file.path)}
							onDiscard={() => {
								setConfirmDiscard(file.path);
							}}
							onLineClick={(lineNumber, content) => {
								setActiveComment({ filePath: file.path, lineNumber, content });
							}}
						/>
					))
				)}
			</main>

			{showShortcuts && (
				<div
					className="modal-overlay"
					onClick={() => {
						setShowShortcuts(false);
					}}
				>
					<div
						className="shortcuts-modal"
						onClick={(e) => {
							e.stopPropagation();
						}}
					>
						<h3>Keyboard Shortcuts</h3>
						<ul>
							<li>
								<kbd>j</kbd> Next file
							</li>
							<li>
								<kbd>k</kbd> Previous file
							</li>
							<li>
								<kbd>o</kbd> Toggle file
							</li>
							<li>
								<kbd>1</kbd> Branch mode
							</li>
							<li>
								<kbd>2</kbd> Working mode
							</li>
							<li>
								<kbd>3</kbd> Staged mode
							</li>
							<li>
								<kbd>?</kbd> Show shortcuts
							</li>
						</ul>
					</div>
				</div>
			)}

			{confirmDiscard && (
				<div
					className="modal-overlay"
					onClick={() => {
						setConfirmDiscard(null);
					}}
				>
					<div
						className="confirm-modal"
						onClick={(e) => {
							e.stopPropagation();
						}}
					>
						<p>
							Discard changes to <strong>{confirmDiscard}</strong>?
						</p>
						<p className="muted">This cannot be undone.</p>
						<div className="modal-actions">
							<button
								type="button"
								onClick={() => {
									setConfirmDiscard(null);
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								className="danger"
								onClick={() => void handleDiscard(confirmDiscard)}
							>
								Discard
							</button>
						</div>
					</div>
				</div>
			)}

			{activeComment && (
				<div
					className="modal-overlay"
					onClick={() => {
						setActiveComment(null);
					}}
				>
					<div
						className="comment-modal"
						onClick={(e) => {
							e.stopPropagation();
						}}
					>
						<h3>Comment on line {activeComment.lineNumber}</h3>
						{activeComment.content && <pre className="code-preview">{activeComment.content}</pre>}
						<textarea
							placeholder="Write your comment..."
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									const text = e.currentTarget.value.trim();
									if (text) {
										void handleAddComment(text);
									}
								}
							}}
						/>
						<div className="modal-actions">
							<button
								type="button"
								onClick={() => {
									setActiveComment(null);
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={(e) => {
									const textarea =
										e.currentTarget.parentElement?.parentElement?.querySelector("textarea");
									const text = textarea?.value.trim();
									if (text) {
										void handleAddComment(text);
									}
								}}
							>
								Comment
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
