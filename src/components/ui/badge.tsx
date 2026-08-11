import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "success" | "warning" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-muted text-muted-foreground",
  outline: "border border-border text-foreground",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
