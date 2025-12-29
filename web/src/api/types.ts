/**
 * API types - re-exports shared types and adds frontend-specific ones
 */

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
} from "@cerebro/types";

// Frontend-specific types

/**
 * Response from GET /api/repos
 */
export interface ReposResponse {
  repos: import("@cerebro/types").Repository[];
  currentRepo?: string;
}
