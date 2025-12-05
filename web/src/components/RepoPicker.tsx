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

export function RepoPicker({ repos, currentRepo, onSelect, onAdd, onRemove: _onRemove }: RepoPickerProps) {
	const [showPicker, setShowPicker] = useState(false);
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
		</div>
	);
}
