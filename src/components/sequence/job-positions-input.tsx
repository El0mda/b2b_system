// Picks the job positions a sequence is written for.
//
// Suggestions come from the same Lusha job-title autocomplete the lead
// search uses, so the wording matches what Lusha returns on leads — which
// is what the positions are later matched against. Free text is accepted
// too: Enter adds exactly what was typed.
import { useRef, useState } from "react";
import { X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { DEFAULT_JOB_TITLES } from "@/lib/lusha-defaults";

export function JobPositionsInput({
  value,
  onChange,
  placeholder = "e.g. HR Manager, Human Resources…",
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const add = (title: string) => {
    const t = title.trim();
    if (!t) return;
    // Case-insensitive de-dupe: "HR Manager" and "hr manager" match the
    // same leads, so keeping both would only clutter the list.
    if (!value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setInput("");
    setSuggestions([]);
  };

  const remove = (title: string) => onChange(value.filter((v) => v !== title));

  const seed = (q: string) =>
    DEFAULT_JOB_TITLES.map((o) => o.name).filter((n) =>
      n.toLowerCase().includes(q.toLowerCase()),
    );

  const search = (q: string) => {
    clearTimeout(timer.current);
    // Lusha's autocomplete needs 2+ characters; below that, filter the
    // built-in starter list so the field still opens like a dropdown.
    if (q.trim().length < 2) {
      setSuggestions(seed(q).slice(0, 12));
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("lusha-proxy", {
          body: { action: "autocomplete-job-titles", query: q },
        });
        const names: string[] = ((data as any)?.results ?? []).map((r: any) => r.name);
        setSuggestions(names.slice(0, 12));
      } catch {
        setSuggestions(seed(q).slice(0, 12));
      }
    }, 300);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
                className="rounded-full hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          value={input}
          placeholder={placeholder}
          onFocus={() => search(input)}
          onChange={(e) => {
            setInput(e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setSuggestions([]), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Exactly what was typed wins; a suggestion only when the
              // field is empty.
              const exact = suggestions.find((s) => s.toLowerCase() === input.trim().toLowerCase());
              add(exact ?? (input.trim() || suggestions[0] || ""));
            }
          }}
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="flex w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
