# Typing and Testing Analysis

## Current State

### ✅ What's Good

1. **TypeScript strict mode** - Both `src/` and `web/` pass `tsc --noEmit`
2. **Defined types** - Core types in `src/types/` are well-defined
3. **Basic test coverage** - 6 tests covering CLI repo resolution and comments
4. **Bun test runner** - Already using `bun:test` with proper setup/teardown

### ⚠️ Areas for Improvement

1. **No API validation** - Request bodies are cast with `as`, no runtime validation
2. **Untyped errors** - All errors are generic `Error`, no domain-specific errors
3. **Low test coverage** - Only 2 test files for ~4200 lines of code
4. **No git operation mocking** - Hard to test git-dependent code
5. **No API integration tests** - Server routes untested

---

## Recommended Approach

Based on research, a **pragmatic incremental approach** works best:

### Phase 1: Add Zod for Runtime Validation (Low effort, high impact)

Add validation to API endpoints without changing existing code structure.

```bash
bun add zod
```

**Benefits:**
- Catches malformed requests at runtime
- Auto-generates TypeScript types from schemas
- No architectural changes needed
- Improved error messages for API consumers

**Target files:**
- `src/server/index.ts` - Validate all POST request bodies
- `src/types/` - Replace manual types with Zod schemas

### Phase 2: Expand Test Coverage (Medium effort)

**Priority test targets:**

| Module | Why | Difficulty |
|--------|-----|------------|
| `src/state/` | Core data layer, easy to test | Low |
| `src/server/` | API contract verification | Medium |
| `src/git/` | Complex, needs mocking | High |

**Testing patterns:**

```typescript
// API integration tests with Bun
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "../server";

describe("API", () => {
  beforeAll(async () => {
    await startServer({ port: 0 }); // Random port
  });

  afterAll(() => stopServer());

  it("GET /api/health returns ok", async () => {
    const res = await fetch("http://localhost:PORT/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
```

### Phase 3: Optional - Result Types for Critical Paths

Consider `neverthrow` only for complex error flows:

```typescript
import { ResultAsync } from "neverthrow";

// Git operations that can fail in multiple ways
const getFileDiff = (opts: DiffOptions): ResultAsync<FileDiff, GitError | FileNotFoundError>
```

**Only if:**
- You have complex error recovery logic
- Multiple callers need to handle errors differently
- You want exhaustive error handling at compile time

---

## Concrete Action Items

### Immediate (can do now)

1. [ ] Add Zod schemas for API request validation
2. [ ] Add integration tests for `/api/repos` endpoints
3. [ ] Add tests for `src/state/` remaining functions

### Short-term

4. [ ] Mock `simple-git` for git operation tests
5. [ ] Add snapshot tests for diff output format
6. [ ] Add error boundary tests for malformed data

### Long-term (optional)

7. [ ] Consider neverthrow for git operations
8. [ ] Add E2E tests with real git repos in temp directories
9. [ ] Add property-based testing for edge cases

---

## Recommended Libraries

| Library | Purpose | Bundle Impact |
|---------|---------|---------------|
| `zod` | Runtime validation | ~50KB |
| `neverthrow` | Result types | ~5KB |
| (built-in) | `bun:test` | 0 |

**Not recommended for this project:**
- **Effect-TS** - Overkill for this size, steep learning curve
- **fp-ts** - Same, plus larger bundle
- **io-ts** - Zod is simpler and more popular

---

## Example: Zod Schema for API

```typescript
// src/schemas/api.ts
import { z } from "zod";

export const AddRepoRequestSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

export const MarkViewedRequestSchema = z.object({
  file_path: z.string().min(1),
});

export const AddCommentRequestSchema = z.object({
  file_path: z.string().min(1),
  line_number: z.number().int().positive().optional(),
  text: z.string().min(1, "Comment text is required"),
});

export const CommitRequestSchema = z.object({
  message: z.string().min(1, "Commit message is required"),
});

// Usage in handler:
async function handleAddRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const result = AddRepoRequestSchema.safeParse(body);
  
  if (!result.success) {
    return Response.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 }
    );
  }
  
  // result.data is typed as { path: string }
  const { path } = result.data;
  // ...
}
```

---

## Test Coverage Goals

| Area | Current | Target |
|------|---------|--------|
| State management | 1 file | 3 files |
| CLI commands | 1 file | 2 files |
| Server routes | 0 files | 1 file |
| Git operations | 0 files | 1 file (mocked) |

**Total: 2 → 7 test files**
