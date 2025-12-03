export interface FileContents {
	name: string;
	contents: string;
}

export interface FileDiff {
	path: string;
	status: "added" | "modified" | "deleted" | "renamed" | "untracked";
	additions: number;
	deletions: number;
	patch: string;
	viewed: boolean;
	old_file?: FileContents;
	new_file?: FileContents;
	staged?: boolean; // true if file has staged changes (for working mode)
}

export interface DiffResponse {
	files: FileDiff[];
	branch: string;
	commit: string;
	repo_path: string;
	remote_url?: string;
	mode: "branch" | "working" | "staged";
	base_branch: string;
}

export interface StatusResponse {
	repo_path: string;
	branch: string;
	commit: string;
}

export interface Comment {
	id: string;
	file_path: string;
	line_number?: number;
	text: string;
	timestamp: number;
	branch: string;
	commit: string;
	resolved: boolean;
	resolved_by?: string;
	resolved_at?: number;
}

// Repository tracking
export interface Repository {
	id: string;
	path: string;
	name: string;
	baseBranch: string;
	addedAt: number;
}

export interface ReposResponse {
	repos: Repository[];
	currentRepo?: string;
}
