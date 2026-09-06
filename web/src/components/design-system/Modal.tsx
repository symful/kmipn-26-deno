import { type ReactNode, useEffect, useCallback, useRef } from "react";

interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the user requests closing (backdrop click, Escape key) */
  onClose: () => void;
  /** Modal body content */
  children: ReactNode;
  /** "normal" = 600px, "wide" = 820px */
  size?: "normal" | "wide";
  /** Additional class names for the dialog container */
  className?: string;
}

const WIDTHS = { normal: 600, wide: 820 } as const;

/**
 * Modal — canonical centered modal overlay for the SIGAP design system.
 *
 * Renders a fixed backdrop with blur, a centered dialog card, and traps
 * focus within. Closes on Escape key or backdrop click.
 */
export function Modal({
  open,
  onClose,
  children,
  size = "normal",
  className = "",
}: ModalProps) {
  const container = useRef<HTMLDivElement>(null);
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const controls = Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (!first) {
        e.preventDefault();
        container.current?.focus();
      } else if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === container.current)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    container.current?.focus();
    return () => {
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`bg-white border border-neutral-200 shadow-xl max-h-[90vh] overflow-hidden flex flex-col ${className}`}
        style={{
          width: "100%",
          maxWidth: WIDTHS[size],
          borderRadius: 15,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
