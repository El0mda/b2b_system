import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: ReactNode;
  align?: "start" | "end";
  className?: string;
  children: (close: () => void) => ReactNode;
}

export function DropdownMenu({
  trigger,
  align = "end",
  className,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <div onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-border bg-white py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
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
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
