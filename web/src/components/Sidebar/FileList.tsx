import type { DiffMode, FileDiff } from "../../api/types";
import { FileRow } from "./FileRow";

interface FileListProps {
  files: FileDiff[];
  selectedPath: string | null;
  focusedIndex: number;
  mode: DiffMode;
  onSelectFile: (path: string, index: number) => void;
}

export function FileList({
  files,
  selectedPath,
  focusedIndex,
  mode,
  onSelectFile,
}: FileListProps) {
  if (files.length === 0) {
    return null;
  }

  // In working mode, group by staged/unstaged
  if (mode === "working") {
    const staged = files.filter((f) => f.staged);
    const unstaged = files.filter((f) => !f.staged);

    // Track global index for focus
    let globalIndex = 0;

    return (
      <div className="file-list-groups">
        {staged.length > 0 && (
          <div className="file-group">
            <div className="file-group-header">STAGED ({staged.length})</div>
            <div className="file-group-items">
              {staged.map((file) => {
                const idx = globalIndex++;
                return (
                  <FileRow
                    key={file.path}
                    file={file}
                    isSelected={file.path === selectedPath}
                    isFocused={idx === focusedIndex}
                    onClick={() => onSelectFile(file.path, idx)}
                  />
                );
              })}
            </div>
          </div>
        )}
        {unstaged.length > 0 && (
          <div className="file-group">
            <div className="file-group-header">UNSTAGED ({unstaged.length})</div>
            <div className="file-group-items">
              {unstaged.map((file) => {
                const idx = globalIndex++;
                return (
                  <FileRow
                    key={file.path}
                    file={file}
                    isSelected={file.path === selectedPath}
                    isFocused={idx === focusedIndex}
                    onClick={() => onSelectFile(file.path, idx)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Other modes: flat list
  return (
    <div className="file-list-flat">
      {files.map((file, idx) => (
        <FileRow
          key={file.path}
          file={file}
          isSelected={file.path === selectedPath}
          isFocused={idx === focusedIndex}
          onClick={() => onSelectFile(file.path, idx)}
        />
      ))}
    </div>
  );
}
