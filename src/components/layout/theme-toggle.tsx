import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Sun
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0",
        )}
      />
    </button>
  );
}
