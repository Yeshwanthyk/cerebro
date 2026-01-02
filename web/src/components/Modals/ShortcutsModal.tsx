import { Modal } from "../Modal";
import "./Modals.css";

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <Modal onClose={onClose} className="shortcuts-modal" aria-labelledby="shortcuts-title">
      <h3 id="shortcuts-title">Keyboard Shortcuts</h3>
      <h4>Navigation</h4>
      <ul>
        <li>
          <kbd>j</kbd> / <kbd>k</kbd> Next / previous file
        </li>
        <li>
          <kbd>gg</kbd> First file
        </li>
        <li>
          <kbd>G</kbd> Last file
        </li>
        <li>
          <kbd>Ctrl+d</kbd> / <kbd>Ctrl+u</kbd> Half-page down / up
        </li>
        <li>
          <kbd>l</kbd> / <kbd>Enter</kbd> Expand file
        </li>
        <li>
          <kbd>h</kbd> Collapse file
        </li>
        <li>
          <kbd>o</kbd> Toggle file
        </li>
      </ul>
      <h4>Actions</h4>
      <ul>
        <li>
          <kbd>v</kbd> Toggle reviewed
        </li>
        <li>
          <kbd>s</kbd> Stage file
        </li>
        <li>
          <kbd>u</kbd> Unstage file
        </li>
        <li>
          <kbd>x</kbd> Discard changes
        </li>
        <li>
          <kbd>c</kbd> Commit staged
        </li>
      </ul>
      <h4>Modes</h4>
      <ul>
        <li>
          <kbd>1</kbd> Local mode
        </li>
        <li>
          <kbd>2</kbd> Branch mode
        </li>
        <li>
          <kbd>t</kbd> Toggle split/unified
        </li>
        <li>
          <kbd>?</kbd> Toggle shortcuts
        </li>
        <li>
          <kbd>⌘</kbd>
          <kbd>K</kbd> Command palette
        </li>
      </ul>
    </Modal>
  );
}
