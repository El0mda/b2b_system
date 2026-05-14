import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, id, ...props }, ref) => (
    <label
      htmlFor={id}
      className={cn(
        "relative inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
        checked
          ? "border-primary bg-primary text-white"
          : "border-input bg-background hover:border-primary/60",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        {...props}
      />
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
