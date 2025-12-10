import type { Comment } from "../api/types";

export interface CommentThread {
  comment: Comment;
  replies: CommentThread[];
}
