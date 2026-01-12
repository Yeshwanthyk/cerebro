import { describe, expect, it } from "bun:test";
import { parseUnifiedDiff } from "./pr-diff";

describe("parseUnifiedDiff", () => {
  it("preserves patch headers for diff parsing", () => {
    const rawDiff = `diff --git a/foo.txt b/foo.txt
index 123..456 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,2 +1,2 @@
-hello
+hello world
`;

    const files = parseUnifiedDiff(rawDiff, {});
    expect(files.length).toBe(1);
    const patch = files[0]?.patch ?? "";
    expect(patch.startsWith("diff --git a/foo.txt b/foo.txt")).toBe(true);
    expect(patch).toContain("@@ -1,2 +1,2 @@");
  });
});
