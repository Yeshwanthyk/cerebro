import { FileDiff as FileDiffComponent } from "@pierre/diffs/react";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { Component, useMemo, type ReactNode } from "react";
import type { FileDiff } from "../api/types";

interface DiffViewProps {
  file: FileDiff;
  diffStyle: "split" | "unified";
  viewMode: "patch" | "full";
}

// Error boundary for diff rendering failures
interface ErrorBoundaryState {
  hasError: boolean;
}

class DiffErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
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

// For new files, create a diff from empty to new content
function parseNewFileDiff(file: FileDiff): FileDiffMetadata | null {
  const newFile = file.new_file;
  if (!newFile) return null;
  try {
    return parseDiffFromFile(
      { name: file.path, contents: "" },
      newFile
    );
  } catch {
    return null;
  }
}

function NewFileView({ file }: { file: FileDiff }) {
  const lines = file.new_file?.contents?.split("\n") ?? [];
  return (
    <div className="new-file-view">
      <pre className="new-file-content">
        {lines.map((line, i) => (
          <div key={i} className="new-file-line">
            <span className="line-number">{i + 1}</span>
            <span className="line-add">+</span>
            <span className="line-content">{line}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function DiffView({ file, diffStyle, viewMode }: DiffViewProps) {
  const isNewFile = file.status === "added" || file.status === "untracked";

  const patchMetadata = useMemo(() => {
    if (!file.patch) return null;
    return parsePatchForDiffView(file.patch);
  }, [file.patch]);

  const fullMetadata = useMemo(() => {
    if (viewMode !== "full") return null;
    return parseFullDiff(file);
  }, [file, viewMode]);

  // For new files, try parseDiffFromFile with empty old content
  const newFileMetadata = useMemo(() => {
    if (!isNewFile) return null;
    return parseNewFileDiff(file);
  }, [file, isNewFile]);

  // Priority: full mode > new file diff > patch
  const fileDiffMetadata = viewMode === "full" 
    ? fullMetadata ?? patchMetadata 
    : (isNewFile ? newFileMetadata ?? patchMetadata : patchMetadata);

  const fallback = isNewFile && file.new_file ? (
    <NewFileView file={file} />
  ) : (
    <div className="diff-error">
      <span>Unable to render diff</span>
    </div>
  );

  if (fileDiffMetadata) {
    return (
      <DiffErrorBoundary fallback={fallback}>
        <FileDiffComponent
          fileDiff={fileDiffMetadata}
          options={{
            theme: "pierre-dark",
            diffStyle,
            diffIndicators: "bars",
            overflow: "wrap",
          }}
        />
      </DiffErrorBoundary>
    );
  }

  return fallback;
}
