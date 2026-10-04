// Picks the departments a sequence is written for.
//
// Job positions match a title's wording; a department matches the whole
// function however the title is worded, which is what you want when the
// leads say "HR", "Head of People" and "Talent Acquisition Manager" and
// you wrote one HR sequence. The list is the app's own (lib/job-match.ts)
// rather than the data provider's, because the same keys have to work for
// imported leads that carry no department at all.
import { DEPARTMENTS } from "@/lib/job-match";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { Layers } from "lucide-react";

const OPTIONS = DEPARTMENTS.map((d) => ({ id: d.key, name: d.name }));

export function DepartmentsInput({
  value,
  onChange,
  placeholder = "Any department",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <MultiSelectDropdown
      icon={<Layers className="h-4 w-4 text-muted-foreground" />}
      options={OPTIONS}
      selected={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}
