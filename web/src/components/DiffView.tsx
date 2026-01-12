import { FileDiff as FileDiffComponent } from "@pierre/diffs/react";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useMemo } from "react";
import type { FileDiff } from "../api/types";

interface DiffViewProps {
  file: FileDiff;
  diffStyle: "split" | "unified";
  viewMode: "patch" | "full";
}

export function parsePatchForDiffView(patch: string): FileDiffMetadata | null {
  try {
    return getSingularPatch(patch);
  } catch {
    return null;
  }
}

function parseFullDiff(file: FileDiff): FileDiffMetadata | null {
  const oldFile = file.old_file;
  const newFile = file.new_file;
  if (!oldFile || !newFile) {
    return null;
  }
  try {
    return parseDiffFromFile(oldFile, newFile);
  } catch {
    return null;
  }
}

export function DiffView({ file, diffStyle, viewMode }: DiffViewProps) {
  const patchMetadata = useMemo(() => {
    if (!file.patch) return null;
    return parsePatchForDiffView(file.patch);
  }, [file.patch]);

  const fullMetadata = useMemo(() => {
    if (viewMode !== "full") return null;
    return parseFullDiff(file);
  }, [file, viewMode]);

  const fileDiffMetadata = viewMode === "full" ? fullMetadata ?? patchMetadata : patchMetadata;

  if (fileDiffMetadata) {
    return (
      <FileDiffComponent
        fileDiff={fileDiffMetadata}
        options={{
          theme: "pierre-dark",
          diffStyle,
          diffIndicators: "bars",
          overflow: "wrap",
        }}
      />
    );
  }

  return (
    <div className="diff-loading">
      <span>No diff content available</span>
    </div>
  );
}
