import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu } from "./dropdown-menu";
import { Input } from "./input";
import type { LushaFilterOption } from "@/lib/lusha";

export function MultiSelectDropdown({
  icon,
  options,
  selected,
  onChange,
  placeholder = "Any",
  emptyMessage = "No options",
  single = false,
}: {
  icon?: ReactNode;
  options: LushaFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  /** Pick at most one: choosing an option replaces the last and closes the list. */
  single?: boolean;
}) {
  const [filter, setFilter] = useState("");

  const pick = (id: string, close: () => void) => {
    if (single) {
      onChange(selected.includes(id) ? [] : [id]);
      setFilter("");
      close();
      return;
    }
    onChange(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    );
  };

  const visible = filter
    ? options.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase()))
    : options;

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.name ?? "1 selected")
        : `${selected.length} selected`;

  return (
    <DropdownMenu
      align="start"
      matchTriggerWidth
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
        >
          {icon}
          <span
            className={cn(
              "flex-1 truncate text-left",
              selected.length === 0 && "text-muted-foreground",
            )}
          >
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      }
    >
      {(close) => (
        <div className="flex max-h-72 w-full flex-col">
          {options.length > 6 && (
            <FilterBox value={filter} onChange={setFilter} />
          )}
          <div className="overflow-auto overscroll-contain py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {filter ? `Nothing matches "${filter}"` : emptyMessage}
              </p>
            ) : (
              visible.map((o) => {
                const checked = selected.includes(o.id);
                // A plain button with a drawn checkbox: the shared Checkbox
                // is itself a <label>, and a label inside a label toggles
                // unreliably — the "can't select anything" bug.
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => pick(o.id, close)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                      checked && "font-medium",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
                        single ? "rounded-full" : "rounded",
                        checked
                          ? "border-primary bg-primary text-white"
                          : "border-input bg-background",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.count != null && (
                      <span className="text-xs text-muted-foreground">
                        {o.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  onChange([]);
                  if (single) close();
                }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </DropdownMenu>
  );
}

/** The list's type-to-filter box. Focused without scrolling: a focus that
 * scrolls the page closes the dropdown it sits in. */
function FilterBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="relative border-b border-border p-1.5">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type to filter..."
        className="h-7 pl-7 text-xs"
      />
    </div>
  );
}
