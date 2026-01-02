/**
 * API types - re-exports shared types and adds frontend-specific ones
 */

import type {
  FileContents,
  FileDiff,
  DiffMode,
  DiffResponse,
  StatusResponse,
  Comment,
  Note,
  Repository,
  PullRequest,
  PRFilter,
} from "@cerebro/types";

// Re-export all shared types from backend
export type {
  FileContents,
  FileDiff,
  DiffMode,
  DiffResponse,
  StatusResponse,
  Comment,
  Note,
  Repository,
  PullRequest,
  PRFilter,
};

// Frontend-specific types

/**
 * Response from GET /api/repos
 */
export interface ReposResponse {
  repos: Repository[];
  currentRepo?: string;
}

/**
 * Response from GET /api/prs
 */
export interface PRsResponse {
  prs: PullRequest[];
  repo_path: string;
  filter: PRFilter;
}
