/**
 * Zod schemas for API request validation
 * Provides runtime validation with good error messages
 */
import { z } from "zod";

// =============================================================================
// Repository Schemas
// =============================================================================

export const AddRepoRequestSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

export const SetCurrentRepoRequestSchema = z.object({
  id: z.string().min(1, "Repository ID is required"),
});

// =============================================================================
// Viewed Files Schemas
// =============================================================================

export const FilePathRequestSchema = z.object({
  file_path: z.string().min(1, "File path is required"),
});

// =============================================================================
// Git Operations Schemas
// =============================================================================

export const CommitRequestSchema = z.object({
  message: z.string().min(1, "Commit message is required"),
});

// =============================================================================
// Comments Schemas
// =============================================================================

export const AddCommentRequestSchema = z.object({
  file_path: z.string().min(1, "File path is required"),
  line_number: z.number().int().positive().optional(),
  text: z.string().min(1, "Comment text is required"),
});

export const ResolveCommentRequestSchema = z.object({
  comment_id: z.string().min(1, "Comment ID is required"),
  resolved_by: z.string().optional(),
});

// =============================================================================
// Notes Schemas
// =============================================================================

export const AddNoteRequestSchema = z.object({
  file_path: z.string().min(1, "File path is required"),
  line_number: z.number().int().positive(),
  text: z.string().min(1, "Note text is required"),
  author: z.string().min(1, "Author is required"),
  type: z.enum(["explanation", "rationale", "suggestion"]),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const DismissNoteRequestSchema = z.object({
  note_id: z.string().min(1, "Note ID is required"),
  dismissed_by: z.string().optional(),
});

// =============================================================================
// Type exports (inferred from schemas)
// =============================================================================

export type AddRepoRequest = z.infer<typeof AddRepoRequestSchema>;
export type SetCurrentRepoRequest = z.infer<typeof SetCurrentRepoRequestSchema>;
export type FilePathRequest = z.infer<typeof FilePathRequestSchema>;
export type CommitRequest = z.infer<typeof CommitRequestSchema>;
export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;
export type ResolveCommentRequest = z.infer<typeof ResolveCommentRequestSchema>;
export type AddNoteRequest = z.infer<typeof AddNoteRequestSchema>;
export type DismissNoteRequest = z.infer<typeof DismissNoteRequestSchema>;

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * Validate request body against a schema
 * Returns a Response with error details if validation fails
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error messages nicely
  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return {
    success: false,
    response: Response.json(
      {
        error: "Validation failed",
        details: errors,
      },
      { status: 400 }
    ),
  };
}
