import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
  lg: "h-10 px-6 text-sm rounded-md",
  icon: "h-9 w-9 rounded-md",
};

export function buttonStyles(variant: Variant = "default", size: Size = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    VARIANTS[variant],
    SIZES[size],
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", asChild = false, children, ...props }, ref) => {
    const styles = cn(buttonStyles(variant, size), className);

    if (asChild && isValidElement(children)) {
      const child = Children.only(children) as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        ...props,
        ...child.props,
        className: cn(styles, child.props.className),
      } as object);
    }

    return (
      <button ref={ref} className={styles} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
