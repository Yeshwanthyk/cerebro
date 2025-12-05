import { useState, useEffect, useCallback, useRef } from "react";
import "./DirectoryPicker.css";

interface DirectoryEntry {
	name: string;
	path: string;
	type: "directory" | "file";
	isGitRepo: boolean;
}

interface BrowseResponse {
	currentPath: string;
	parentPath: string | null;
	currentIsGitRepo: boolean;
	entries: DirectoryEntry[];
}

interface DirectoryPickerProps {
	onSelect: (path: string) => void;
	onCancel: () => void;
	isAdding?: boolean;
	error?: string | null;
}

const RECENT_PATHS_KEY = "cerebro-recent-paths";
const MAX_RECENT = 5;

function getRecentPaths(): string[] {
	try {
		const stored = localStorage.getItem(RECENT_PATHS_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

function addRecentPath(path: string) {
	const recent = getRecentPaths().filter((p) => p !== path);
	recent.unshift(path);
	localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function DirectoryPicker({ onSelect, onCancel, isAdding, error }: DirectoryPickerProps) {
	const [currentPath, setCurrentPath] = useState<string>("");
	const [parentPath, setParentPath] = useState<string | null>(null);
	const [entries, setEntries] = useState<DirectoryEntry[]>([]);
	const [currentIsGitRepo, setCurrentIsGitRepo] = useState(false);
	const [loading, setLoading] = useState(true);
	const [pathInput, setPathInput] = useState("");
	const [showManualInput, setShowManualInput] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const recentPaths = getRecentPaths();

	const browse = useCallback(async (path?: string) => {
		setLoading(true);
		setSelectedIndex(-1);
		try {
			const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
			const res = await fetch(url);
			const data: BrowseResponse = await res.json();
			setCurrentPath(data.currentPath);
			setParentPath(data.parentPath);
			setEntries(data.entries);
			setCurrentIsGitRepo(data.currentIsGitRepo);
			setPathInput(data.currentPath);
		} catch (err) {
			console.error("Browse failed:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		browse();
	}, [browse]);

	const handleSelect = () => {
		if (currentIsGitRepo) {
			addRecentPath(currentPath);
			onSelect(currentPath);
		}
	};

	const handleEntryClick = (entry: DirectoryEntry) => {
		if (entry.isGitRepo) {
			addRecentPath(entry.path);
			onSelect(entry.path);
		} else {
			browse(entry.path);
		}
	};

	const handleEntryDoubleClick = (entry: DirectoryEntry) => {
		browse(entry.path);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (showManualInput) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setSelectedIndex((i) => Math.max(i - 1, -1));
				break;
			case "Enter":
				e.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < entries.length) {
					const entry = entries[selectedIndex];
					if (entry.isGitRepo) {
						handleEntryClick(entry);
					} else {
						browse(entry.path);
					}
				} else if (currentIsGitRepo) {
					handleSelect();
				}
				break;
			case "Backspace":
				if (parentPath) {
					e.preventDefault();
					browse(parentPath);
				}
				break;
			case "Escape":
				e.preventDefault();
				onCancel();
				break;
		}
	};

	const handleManualSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (pathInput.trim()) {
			browse(pathInput.trim());
			setShowManualInput(false);
		}
	};

	useEffect(() => {
		if (selectedIndex >= 0 && listRef.current) {
			const item = listRef.current.children[selectedIndex] as HTMLElement;
			item?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const pathParts = currentPath.split("/").filter(Boolean);

	return (
		<div className="directory-picker-overlay" onClick={onCancel}>
			<div className="directory-picker" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0}>
				<div className="dp-header">
					<div className="dp-title">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						</svg>
						<span>Select Repository</span>
					</div>
					<button className="dp-close" onClick={onCancel}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Breadcrumb navigation */}
				<div className="dp-breadcrumb">
					<button className="dp-crumb dp-crumb-root" onClick={() => browse("/")}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
						</svg>
					</button>
					{pathParts.map((part, i) => (
						<button key={i} className="dp-crumb" onClick={() => browse("/" + pathParts.slice(0, i + 1).join("/"))}>
							<span className="dp-crumb-sep">/</span>
							{part}
						</button>
					))}
					<button
						className="dp-edit-path"
						onClick={() => {
							setShowManualInput(true);
							setTimeout(() => inputRef.current?.focus(), 0);
						}}
						title="Edit path"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
					</button>
				</div>

				{showManualInput && (
					<form className="dp-manual-input" onSubmit={handleManualSubmit}>
						<input
							ref={inputRef}
							type="text"
							value={pathInput}
							onChange={(e) => setPathInput(e.target.value)}
							placeholder="/path/to/repository"
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
						/>
						<button type="submit">Go</button>
						<button type="button" onClick={() => setShowManualInput(false)}>
							Cancel
						</button>
					</form>
				)}

				{/* Recent paths */}
				{recentPaths.length > 0 && !loading && entries.length === 0 && (
					<div className="dp-recent">
						<div className="dp-recent-header">Recent Repositories</div>
						{recentPaths.map((p) => (
							<button key={p} className="dp-recent-item" onClick={() => onSelect(p)}>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								<span className="dp-recent-path">{p}</span>
							</button>
						))}
					</div>
				)}

				{/* Directory listing */}
				<div className="dp-list" ref={listRef}>
					{loading ? (
						<div className="dp-loading">
							<div className="dp-spinner" />
							<span>Loading...</span>
						</div>
					) : entries.length === 0 ? (
						<div className="dp-empty">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
							</svg>
							<span>No subdirectories</span>
						</div>
					) : (
						entries.map((entry, i) => (
							<button
								key={entry.path}
								className={`dp-entry ${entry.isGitRepo ? "dp-entry-repo" : ""} ${selectedIndex === i ? "dp-entry-selected" : ""}`}
								onClick={() => handleEntryClick(entry)}
								onDoubleClick={() => handleEntryDoubleClick(entry)}
							>
								{entry.isGitRepo ? (
									<svg className="dp-icon dp-icon-repo" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
										<circle cx="12" cy="12" r="3" />
										<path d="M12 3v6M12 15v6" />
										<path d="M5.63 5.63l4.25 4.25M14.12 14.12l4.25 4.25" />
										<path d="M3 12h6M15 12h6" />
										<path d="M5.63 18.37l4.25-4.25M14.12 9.88l4.25-4.25" />
									</svg>
								) : (
									<svg className="dp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
										<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
									</svg>
								)}
								<span className="dp-entry-name">{entry.name}</span>
								{entry.isGitRepo && <span className="dp-badge">git</span>}
								<svg className="dp-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<polyline points="9 18 15 12 9 6" />
								</svg>
							</button>
						))
					)}
				</div>

				{/* Footer with current selection */}
				<div className="dp-footer">
					{error && <div className="dp-error">{error}</div>}
					<div className="dp-selection">
						{currentIsGitRepo ? (
							<>
								<svg className="dp-selection-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<polyline points="20 6 9 17 4 12" />
								</svg>
								<span>Git repository detected</span>
							</>
						) : (
							<span className="dp-hint">Navigate to a git repository or select one from the list</span>
						)}
					</div>
					<div className="dp-actions">
						<button className="dp-btn dp-btn-cancel" onClick={onCancel}>
							Cancel
						</button>
						<button className="dp-btn dp-btn-select" onClick={handleSelect} disabled={!currentIsGitRepo || isAdding}>
							{isAdding ? (
								<>
									<span className="dp-btn-spinner" />
									Adding...
								</>
							) : (
								"Add Repository"
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
