interface WelcomePanelProps {
  hasFiles: boolean;
}

export function WelcomePanel({ hasFiles }: WelcomePanelProps) {
  if (!hasFiles) {
    return (
      <div className="welcome-panel">
        <div className="welcome-panel-content">
          <p className="welcome-title">No files to review</p>
          <p className="welcome-subtitle">Changes will appear here when available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-panel">
      <div className="welcome-panel-content">
        <p className="welcome-title">Select a file to view diff</p>
        <div className="welcome-shortcuts">
          <div className="shortcut-row">
            <kbd>j</kbd><kbd>k</kbd>
            <span>Navigate files</span>
          </div>
          <div className="shortcut-row">
            <kbd>Enter</kbd>
            <span>Select file</span>
          </div>
          <div className="shortcut-row">
            <kbd>v</kbd>
            <span>Mark reviewed</span>
          </div>
          <div className="shortcut-row">
            <kbd>?</kbd>
            <span>All shortcuts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
