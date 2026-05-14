import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <label
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        {...props}
      />
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </label>
  ),
);
Switch.displayName = "Switch";
