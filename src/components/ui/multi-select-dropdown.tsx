import { useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu } from "./dropdown-menu";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import type { LushaFilterOption } from "@/lib/lusha";

export function MultiSelectDropdown({
  icon,
  options,
  selected,
  onChange,
  placeholder = "Any",
  emptyMessage = "No options",
}: {
  icon?: ReactNode;
  options: LushaFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
}) {
  const [filter, setFilter] = useState("");

  const toggle = (id: string) => {
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
      {() => (
        <div className="flex max-h-72 w-full flex-col">
          {options.length > 6 && (
            <div className="relative border-b border-border p-1.5">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter..."
                className="h-7 pl-7 text-xs"
                autoFocus
              />
            </div>
          )}
          <div className="overflow-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              visible.map((o) => {
                const checked = selected.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(o.id)}
                    />
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.count != null && (
                      <span className="text-xs text-muted-foreground">
                        {o.count}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onChange([])}
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
