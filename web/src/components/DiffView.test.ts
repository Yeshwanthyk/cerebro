import { describe, expect, it } from "bun:test";
import { parsePatchForDiffView } from "./DiffView";

describe("parsePatchForDiffView", () => {
  it("parses a single-file patch", () => {
    const patch = `diff --git a/foo.txt b/foo.txt
index 123..456 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,2 +1,2 @@
-hello
+hello world
`;

    const parsed = parsePatchForDiffView(patch);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe("foo.txt");
    expect(parsed?.hunks.length).toBe(1);
  });
});
