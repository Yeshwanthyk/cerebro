/**
 * State management - re-exports all state modules
 */

// Database utilities
export { closeDb } from "./db";

// Configuration
export { getConfig, saveConfig } from "./config";

// Repository management
export {
  getReposState,
  getRepos,
  getRepo,
  getRepoByPath,
  addRepo,
  removeRepo,
  setCurrentRepo,
  getCurrentRepo,
  updateRepo,
} from "./repos";

// Viewed files
export { getViewedFiles, setFileViewed } from "./viewed";

// Comments
export { getComments, getCommentById, addComment, resolveComment } from "./comments";

// Notes
export { getNotes, addNote, dismissNote } from "./notes";
