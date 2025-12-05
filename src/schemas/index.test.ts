import { describe, expect, it } from "bun:test";
import {
  AddRepoRequestSchema,
  FilePathRequestSchema,
  CommitRequestSchema,
  AddCommentRequestSchema,
  AddNoteRequestSchema,
  validateRequest,
} from "./index";

describe("schemas", () => {
  describe("AddRepoRequestSchema", () => {
    it("accepts valid path", () => {
      const result = AddRepoRequestSchema.safeParse({ path: "/some/path" });
      expect(result.success).toBe(true);
    });

    it("rejects missing path", () => {
      const result = AddRepoRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty path", () => {
      const result = AddRepoRequestSchema.safeParse({ path: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("FilePathRequestSchema", () => {
    it("accepts valid file_path", () => {
      const result = FilePathRequestSchema.safeParse({ file_path: "src/index.ts" });
      expect(result.success).toBe(true);
    });

    it("rejects missing file_path", () => {
      const result = FilePathRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("CommitRequestSchema", () => {
    it("accepts valid message", () => {
      const result = CommitRequestSchema.safeParse({ message: "Fix bug" });
      expect(result.success).toBe(true);
    });

    it("rejects empty message", () => {
      const result = CommitRequestSchema.safeParse({ message: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("AddCommentRequestSchema", () => {
    it("accepts comment with line number", () => {
      const result = AddCommentRequestSchema.safeParse({
        file_path: "src/index.ts",
        line_number: 42,
        text: "Consider refactoring",
      });
      expect(result.success).toBe(true);
    });

    it("accepts comment without line number", () => {
      const result = AddCommentRequestSchema.safeParse({
        file_path: "src/index.ts",
        text: "File-level comment",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid line number", () => {
      const result = AddCommentRequestSchema.safeParse({
        file_path: "src/index.ts",
        line_number: -1,
        text: "Invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing text", () => {
      const result = AddCommentRequestSchema.safeParse({
        file_path: "src/index.ts",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("AddNoteRequestSchema", () => {
    it("accepts valid note", () => {
      const result = AddNoteRequestSchema.safeParse({
        file_path: "src/index.ts",
        line_number: 10,
        text: "This function does X",
        author: "AI",
        type: "explanation",
      });
      expect(result.success).toBe(true);
    });

    it("accepts note with metadata", () => {
      const result = AddNoteRequestSchema.safeParse({
        file_path: "src/index.ts",
        line_number: 10,
        text: "Consider using Y",
        author: "AI",
        type: "suggestion",
        metadata: { confidence: "high" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = AddNoteRequestSchema.safeParse({
        file_path: "src/index.ts",
        line_number: 10,
        text: "Note",
        author: "AI",
        type: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validateRequest helper", () => {
    it("returns success with data for valid input", () => {
      const result = validateRequest(AddRepoRequestSchema, { path: "/valid/path" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.path).toBe("/valid/path");
      }
    });

    it("returns response for invalid input", () => {
      const result = validateRequest(AddRepoRequestSchema, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response).toBeDefined();
        expect(result.response.status).toBe(400);
      }
    });

    it("includes error details in response", async () => {
      const result = validateRequest(AddRepoRequestSchema, {});
      expect(result.success).toBe(false);
      if (!result.success) {
        const body = (await result.response.json()) as {
          error: string;
          details: Array<{ path: string; message: string }>;
        };
        expect(body.error).toBe("Validation failed");
        expect(body.details).toBeDefined();
        expect(Array.isArray(body.details)).toBe(true);
      }
    });
  });
});
