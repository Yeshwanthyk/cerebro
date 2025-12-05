import { useState } from "react";
import type { Repository } from "../api/types";
import { DirectoryPicker } from "./DirectoryPicker";

interface RepoPickerProps {
	repos: Repository[];
	currentRepo: string | null;
	onSelect: (id: string) => void;
	onAdd: (path: string) => Promise<void>;
	onRemove: (id: string) => void;
}

export function RepoPicker({ repos, currentRepo, onSelect, onAdd, onRemove }: RepoPickerProps) {
	const [showPicker, setShowPicker] = useState(false);
	const [showManage, setShowManage] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [isAdding, setIsAdding] = useState(false);

	const currentRepoData = repos.find((r) => r.id === currentRepo);

	const handleAdd = async (path: string) => {
		setIsAdding(true);
		setAddError(null);

		try {
			await onAdd(path);
			setShowPicker(false);
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

			<button type="button" className="add-repo-btn" onClick={() => setShowPicker(true)} title="Add repository">
				+
			</button>

			{repos.length > 0 && (
				<button type="button" className="manage-repo-btn" onClick={() => setShowManage(true)} title="Manage repositories">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="1" />
						<circle cx="19" cy="12" r="1" />
						<circle cx="5" cy="12" r="1" />
					</svg>
				</button>
			)}

			{currentRepoData && (
				<span className="repo-info">
					<span className="repo-branch">{currentRepoData.baseBranch}</span>
				</span>
			)}

			{showPicker && (
				<DirectoryPicker
					onSelect={(path) => void handleAdd(path)}
					onCancel={() => {
						setShowPicker(false);
						setAddError(null);
					}}
					isAdding={isAdding}
					error={addError}
				/>
			)}

			{showManage && (
				<div className="modal-overlay" onClick={() => setShowManage(false)}>
					<div className="manage-repos-modal" onClick={(e) => e.stopPropagation()}>
						<div className="manage-repos-header">
							<h3>Manage Repositories</h3>
							<button className="dp-close" onClick={() => setShowManage(false)}>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
						<div className="manage-repos-list">
							{repos.map((repo) => (
								<div key={repo.id} className={`manage-repo-item ${repo.id === currentRepo ? "current" : ""}`}>
									<div className="manage-repo-info">
										<span className="manage-repo-name">{repo.name}</span>
										<span className="manage-repo-path">{repo.path}</span>
									</div>
									<button
										className="remove-repo-btn"
										onClick={() => {
											onRemove(repo.id);
											if (repos.length === 1) {
												setShowManage(false);
											}
										}}
										title="Remove repository"
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
											<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									</button>
								</div>
							))}
						</div>
						<div className="manage-repos-footer">
							<button className="dp-btn dp-btn-cancel" onClick={() => setShowManage(false)}>
								Done
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
