import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  "aria-labelledby"?: string;
}

export function Modal({ children, onClose, className, "aria-labelledby": labelledBy }: ModalProps) {
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={className}
        role="document"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
