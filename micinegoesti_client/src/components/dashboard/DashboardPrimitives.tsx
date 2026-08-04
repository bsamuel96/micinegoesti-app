import { Inbox, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function DashboardPanelHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="products-panel-header dashboard-panel-header">
      <div>
        <span className="dashboard-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function DashboardPanelTabs<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="products-section-switcher" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          className={value === option.value ? "is-active" : ""}
          type="button"
          aria-pressed={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  onRefresh,
  refreshing = false
}: {
  title: string;
  description: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="dashboard-empty-state">
      <Inbox aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {onRefresh && (
        <button className="secondary-button" type="button" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw aria-hidden="true" size={18} />
          {refreshing ? "Se actualizează…" : "Actualizează"}
        </button>
      )}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warning" | "success" | "danger";
}) {
  return <span className={`dashboard-status-badge is-${tone}`}>{children}</span>;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  danger = false,
  alternateLabel,
  onCancel,
  onConfirm,
  onAlternate
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
  alternateLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onAlternate?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, pending, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="dashboard-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onCancel();
    }}>
      <div
        ref={dialogRef}
        className="dashboard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button className="dashboard-dialog-close" type="button" aria-label="Închide" disabled={pending} onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="dashboard-dialog-content">{description}</div>
        <div className="dashboard-dialog-actions">
          <button ref={cancelRef} className="secondary-button" type="button" disabled={pending} onClick={onCancel}>
            Renunță
          </button>
          {alternateLabel && onAlternate && (
            <button className="primary-button" type="button" disabled={pending} onClick={onAlternate}>
              {alternateLabel}
            </button>
          )}
          <button className={danger ? "danger-button" : "primary-button"} type="button" disabled={pending} onClick={onConfirm}>
            {pending ? "Se salvează…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
