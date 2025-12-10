// File contents for diff display
export interface FileContents {
  name: string;
  contents: string;
}

// Individual file diff information
export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  additions: number;
  deletions: number;
  patch: string;
  viewed: boolean;
  old_file?: FileContents;
  new_file?: FileContents;
  staged?: boolean;
}

// Diff response from API
export type DiffMode = "branch" | "working";

export interface DiffResponse {
  files: FileDiff[];
  branch: string;
  commit: string;
  repo_path: string;
  remote_url?: string;
  mode: DiffMode;
  base_branch: string;
}

// Repository status
export interface StatusResponse {
  repo_path: string;
  branch: string;
  commit: string;
}

// Comment on a file/line
export interface Comment {
  id: string;
  file_path: string;
  line_number?: number;
  text: string;
  parent_id?: string;
  timestamp: number;
  branch: string;
  commit: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: number;
}

// Note (AI-generated or user) on a file/line
export interface Note {
  id: string;
  file_path: string;
  line_number: number;
  text: string;
  timestamp: number;
  branch: string;
  commit: string;
  author: string;
  type: "explanation" | "rationale" | "suggestion";
  metadata?: Record<string, string>;
  dismissed: boolean;
  dismissed_by?: string;
  dismissed_at?: number;
}

// Repository tracking
export interface Repository {
  id: string;
  path: string;
  name: string;
  baseBranch: string;
  addedAt: number;
}

// Global configuration
export interface Config {
  defaultPort: number;
  currentRepo?: string;
}

// Repos state file
export interface ReposState {
  repos: Repository[];
  currentRepo?: string;
}

// Per-repo state
export interface RepoState {
  viewed: Record<string, boolean>; // file path -> viewed
  comments: Comment[];
  notes: Note[];
}
