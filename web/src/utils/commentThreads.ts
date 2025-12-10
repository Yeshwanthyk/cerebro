import type { Comment } from "../api/types";
import type { CommentThread } from "../types/commentThread";

export function buildCommentThreads(comments: Comment[]): CommentThread[] {
  const nodes = new Map<string, CommentThread>();
  const roots: CommentThread[] = [];

  for (const comment of comments) {
    nodes.set(comment.id, { comment, replies: [] });
  }

  for (const thread of nodes.values()) {
    const parentId = thread.comment.parent_id;
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)?.replies.push(thread);
    } else {
      roots.push(thread);
    }
  }

  const sortThreads = (list: CommentThread[]) => {
    list.sort((a, b) => a.comment.timestamp - b.comment.timestamp);
    for (const child of list) {
      sortThreads(child.replies);
    }
  };

  sortThreads(roots);
  return roots;
}
