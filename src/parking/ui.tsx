import type { ReactNode } from "react";
import type { SlotStatus } from "./data";

// Small Swiss-grid building blocks shared across both interfaces.

export function StatusDot({ status }: { status: SlotStatus }) {
  const map: Record<SlotStatus, string> = {
    available: "bg-available",
    occupied: "bg-occupied",
    reserved: "bg-reserved",
    out_of_service: "bg-ink-soft",
  };
  return <span className={`inline-block size-2 ${map[status]}`} />;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-white ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
