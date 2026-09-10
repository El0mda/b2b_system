import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Settings, UsersRound, ArrowRight, CornerDownLeft } from "lucide-react";
import { NAV } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

interface Command {
  label: string;
  hint?: string;
  to: string;
  icon: typeof Search;
}

const EXTRA_COMMANDS: Command[] = [
  { label: "New Campaign", to: "/campaigns/new", icon: ArrowRight, hint: "Create" },
  { label: "Team", to: "/team", icon: UsersRound },
];

// Settings is owner-only, so it's handed in rather than listed above.
const SETTINGS_COMMAND: Command = { label: "Settings", to: "/settings", icon: Settings };

export function CommandPalette({
  open,
  onClose,
  showSettings = false,
}: {
  open: boolean;
  onClose: () => void;
  showSettings?: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const commands: Command[] = useMemo(
    () => [
      ...NAV.map((n) => ({ label: n.label, to: n.to, icon: n.icon })),
      ...EXTRA_COMMANDS,
      ...(showSettings ? [SETTINGS_COMMAND] : []),
    ],
    [showSettings],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => setActiveIdx(0), [query]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[activeIdx];
        if (r) go(r.to);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-border bg-card shadow-premium-lg"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={r.to}
                onClick={() => go(r.to)}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  i === activeIdx
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{r.label}</span>
                {i === activeIdx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
