import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  title: string;
  onClose?: () => void;
  footer?: ReactNode;
  dialogClassName?: string;
  dismissible?: boolean;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

/**
 * React-owned modal markup styled by Bootstrap CSS, without Bootstrap's JavaScript.
 * It traps keyboard focus while open and restores focus to the element that opened it.
 */
export default function Modal({
  children,
  title,
  onClose,
  footer,
  dialogClassName = "",
  dismissible = Boolean(onClose),
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const canDismiss = dismissible && onClose !== undefined;

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && canDismiss) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [canDismiss, onClose]);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusableElements[0]!;
    const last = focusableElements[focusableElements.length - 1]!;
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === first || activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="modal d-block"
      onMouseDown={(event) => {
        if (canDismiss && event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className={`modal-dialog modal-dialog-centered ${dialogClassName}`.trim()}>
        <div className="modal-content" onKeyDown={trapFocus} ref={dialogRef} tabIndex={-1}>
          <div className="modal-header">
            <h2 className="modal-title fs-4" id={titleId}>
              {title}
            </h2>
            {canDismiss ? (
              <button aria-label="Close" className="btn-close" onClick={onClose} type="button" />
            ) : null}
          </div>
          <div className="modal-body">{children}</div>
          {footer ? <div className="modal-footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
