/**
 * Git module types
 */
import type { SimpleGit, StatusResult } from "simple-git";
import type { DiffMode, DiffResponse, FileDiff } from "../types";

export interface GitManager {
  repoPath: string;
  git: SimpleGit;
  getDiff(options: { baseBranch: string; mode: DiffMode }): Promise<DiffResponse>;
  getFileDiff(options: { baseBranch: string; mode: DiffMode; filePath: string }): Promise<FileDiff | null>;
  getCurrentBranch(): Promise<string>;
  getCurrentCommit(): Promise<string>;
  getDefaultBranch(): Promise<string>;
  getRemoteUrl(): Promise<string | undefined>;
  getBranches(): Promise<string[]>;
  stageFile(filePath: string): Promise<void>;
  stageAll(): Promise<void>;
  unstageFile(filePath: string): Promise<void>;
  discardFile(filePath: string): Promise<void>;
  commit(message: string): Promise<string>;
  status(): Promise<StatusResult>;
}
