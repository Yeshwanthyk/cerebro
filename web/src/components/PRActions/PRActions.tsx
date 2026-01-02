import { useEffect, useRef, useState } from "react";
import "./PRActions.css";

interface CommentModalProps {
  title: string;
  comment: string;
  loading: boolean;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function CommentModal({ title, comment, loading, onCommentChange, onSubmit, onClose }: CommentModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="pr-comment-modal-overlay">
      <div className="pr-comment-modal" role="dialog" aria-modal="true" aria-labelledby="comment-modal-title">
        <h3 id="comment-modal-title">{title}</h3>
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Write your review comment..."
          rows={5}
        />
        <div className="pr-comment-modal-actions">
          <button type="button" className="cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="submit"
            onClick={onSubmit}
            disabled={comment.trim() === "" || loading}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PRActionsProps {
  prNumber: number;
  repoId: string;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

type ReviewAction = "approve" | "comment" | "request-changes";

export function PRActions({ prNumber, repoId, onSuccess, onError }: PRActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState<ReviewAction | null>(null);
  const [comment, setComment] = useState("");

  const submitReview = async (action: ReviewAction, body?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pr/review?repo=${repoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr: prNumber, action, body }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to submit review");
      }

      const data = (await res.json()) as { message: string };
      onSuccess(data.message);
      setShowCommentModal(null);
      setComment("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    void submitReview("approve");
  };

  const handleComment = () => {
    setShowCommentModal("comment");
  };

  const handleRequestChanges = () => {
    setShowCommentModal("request-changes");
  };

  const handleSubmitWithComment = () => {
    if (showCommentModal === null || comment.trim() === "") return;
    void submitReview(showCommentModal, comment);
  };

  return (
    <div className="pr-actions">
      <button
        type="button"
        className="pr-action-btn approve"
        onClick={handleApprove}
        disabled={loading}
      >
        ✓ Approve
      </button>
      <button
        type="button"
        className="pr-action-btn comment"
        onClick={handleComment}
        disabled={loading}
      >
        Comment
      </button>
      <button
        type="button"
        className="pr-action-btn request-changes"
        onClick={handleRequestChanges}
        disabled={loading}
      >
        Request Changes
      </button>

      {showCommentModal !== null && (
        <CommentModal
          title={showCommentModal === "comment" ? "Add Comment" : "Request Changes"}
          comment={comment}
          loading={loading}
          onCommentChange={setComment}
          onSubmit={handleSubmitWithComment}
          onClose={() => setShowCommentModal(null)}
        />
      )}
    </div>
  );
}
