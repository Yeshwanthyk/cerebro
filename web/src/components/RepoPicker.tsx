import { useState } from "react";
import type { Repository } from "../api/types";

interface RepoPickerProps {
	repos: Repository[];
	currentRepo: string | null;
	onSelect: (id: string) => void;
	onAdd: (path: string) => Promise<void>;
	onRemove: (id: string) => void;
}

export function RepoPicker({ repos, currentRepo, onSelect, onAdd, onRemove: _onRemove }: RepoPickerProps) {
	const [showAddModal, setShowAddModal] = useState(false);
	const [newPath, setNewPath] = useState("");
	const [addError, setAddError] = useState<string | null>(null);
	const [isAdding, setIsAdding] = useState(false);

	const currentRepoData = repos.find((r) => r.id === currentRepo);

	const handleAdd = async () => {
		if (!newPath.trim()) {
			return;
		}

		setIsAdding(true);
		setAddError(null);

		try {
			await onAdd(newPath.trim());
			setNewPath("");
			setShowAddModal(false);
		} catch (err) {
			setAddError(err instanceof Error ? err.message : "Failed to add repository");
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div className="repo-picker">
			<select
				value={currentRepo || ""}
				onChange={(e) => {
					if (e.target.value) {
						onSelect(e.target.value);
					}
				}}
				className="repo-select"
			>
				{!currentRepo && (
					<option value="" disabled>
						{repos.length === 0 ? "No repositories" : "Select a repository..."}
					</option>
				)}
				{repos.map((repo) => (
					<option key={repo.id} value={repo.id}>
						{repo.name}
					</option>
				))}
			</select>

			<button type="button" className="add-repo-btn" onClick={() => setShowAddModal(true)} title="Add repository">
				+
			</button>

			{currentRepoData && (
				<span className="repo-info">
					<span className="repo-branch">{currentRepoData.baseBranch}</span>
				</span>
			)}

			{showAddModal && (
				<div
					className="modal-overlay"
					onClick={() => {
						setShowAddModal(false);
						setAddError(null);
					}}
				>
					<div
						className="add-repo-modal"
						onClick={(e) => {
							e.stopPropagation();
						}}
					>
						<h3>Add Repository</h3>
						<p className="muted">Enter the full path to a git repository</p>

						<input
							type="text"
							value={newPath}
							onChange={(e) => setNewPath(e.target.value)}
							placeholder="/Users/you/Code/my-project"
							className="repo-path-input"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									void handleAdd();
								}
							}}
							autoFocus
							autoComplete="off"
							autoCorrect="off"
							autoCapitalize="off"
							spellCheck={false}
						/>

						{addError && <p className="error-text">{addError}</p>}

						<div className="modal-actions">
							<button
								type="button"
								onClick={() => {
									setShowAddModal(false);
									setAddError(null);
								}}
							>
								Cancel
							</button>
							<button type="button" onClick={() => void handleAdd()} disabled={isAdding || !newPath.trim()}>
								{isAdding ? "Adding..." : "Add"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
