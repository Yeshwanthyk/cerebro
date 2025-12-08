import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: "navigation" | "actions" | "files" | "settings";
  action: () => void;
  disabled?: boolean;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return commands.filter((c) => !c.disabled);
    }
    const lowerQuery = query.toLowerCase();
    return commands
      .filter((c) => !c.disabled)
      .filter(
        (c) =>
          c.label.toLowerCase().includes(lowerQuery) ||
          c.category.toLowerCase().includes(lowerQuery),
      )
      .sort((a, b) => {
        // Prioritize exact matches at start
        const aStarts = a.label.toLowerCase().startsWith(lowerQuery);
        const bStarts = b.label.toLowerCase().startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
  }, [commands, query]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const existing = groups[cmd.category];
      if (!existing) {
        groups[cmd.category] = [cmd];
      } else {
        existing.push(cmd);
      }
    }
    return groups;
  }, [filteredCommands]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedIndex((i) => Math.max(i - 1, 0));
          } else {
            setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          }
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose],
  );

  const handleItemClick = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose],
  );

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    actions: "Actions",
    files: "Files",
    settings: "Settings",
  };

  const categoryOrder = ["files", "actions", "navigation", "settings"];

  let flatIndex = 0;

  return (
    <div
      className="command-palette-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
      >
        <div className="command-palette-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
          />
          <kbd className="command-palette-hint">esc</kbd>
        </div>
        <div className="command-palette-list" ref={listRef} id="command-palette-list" role="listbox">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">No matching commands</div>
          ) : (
            categoryOrder
              .filter((cat) => groupedCommands[cat]?.length)
              .map((category) => (
                <div key={category} className="command-palette-group" data-category={category}>
                  <div className="command-palette-category">{categoryLabels[category]}</div>
                  {(groupedCommands[category] ?? []).map((cmd) => {
                    const isSelected = flatIndex === selectedIndex;
                    const currentIndex = flatIndex;
                    flatIndex++;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        className={`command-palette-item ${isSelected ? "selected" : ""}`}
                        data-selected={isSelected}
                        onClick={() => handleItemClick(cmd)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="command-palette-label">{cmd.label}</span>
                        {cmd.shortcut && (
                          <span className="command-palette-shortcut">
                            {cmd.shortcut.split("+").map((key, i) => (
                              <kbd key={i}>{key}</kbd>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
