import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStepKey } from "./types";

export function Stepper({ current }: { current: WizardStepKey }) {
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1">
      {WIZARD_STEPS.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
              i < currentIdx
                ? "bg-emerald-500 text-white"
                : i === currentIdx
                  ? "bg-indigo-500 text-white ring-4 ring-indigo-500/20"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < currentIdx ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <div
            className={cn(
              "ml-2 hidden text-sm font-medium md:block",
              i === currentIdx ? "text-indigo-600" : "text-muted-foreground",
            )}
          >
            {s.label}
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div
              className={cn(
                "mx-3 h-0.5 flex-1 rounded transition-colors",
                i < currentIdx ? "bg-emerald-500" : "bg-muted",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
