import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: ReactNode;
  align?: "start" | "end";
  className?: string;
  children: (close: () => void) => ReactNode;
  /** Size the panel to the trigger's width instead of its content (useful for form-field-style triggers). */
  matchTriggerWidth?: boolean;
}

export function DropdownMenu({
  trigger,
  align = "end",
  className,
  children,
  matchTriggerWidth,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Rendered in a portal so ancestors with `overflow: auto/hidden` (e.g. a
  // scrollable table wrapper) can't clip the panel.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 6,
      left: align === "end" ? rect.right + window.scrollX : rect.left + window.scrollX,
      width: rect.width,
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <div
      className={cn("relative", matchTriggerWidth ? "block" : "inline-block")}
      ref={triggerRef}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        className={matchTriggerWidth ? "block" : "inline-flex"}
      >
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              width: matchTriggerWidth ? pos.width : undefined,
              transform:
                !matchTriggerWidth && align === "end"
                  ? "translateX(-100%)"
                  : undefined,
            }}
            className={cn(
              "z-50 min-w-[10rem] animate-scale-in overflow-hidden rounded-xl border border-border bg-card py-1.5 shadow-premium-lg",
              align === "end" && !matchTriggerWidth
                ? "origin-top-right"
                : "origin-top-left",
              className,
            )}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

interface DropdownItemProps {
  onSelect: () => void;
  children: ReactNode;
  destructive?: boolean;
  icon?: ReactNode;
}

export function DropdownItem({ onSelect, children, destructive, icon }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
