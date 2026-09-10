import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, Menu, X, LogOut, Settings, UsersRound } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { NAV } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { DropdownMenu, DropdownItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import logo from "@/assets/company_logo.png";
import logoDark from "@/assets/company_logo_dark.png";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, organization, signOut } = useAuth();
  // Workspace settings are the owner's — admins and members don't get a
  // link to a page that would only refuse them.
  const isOwner = profile?.role === "owner";

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (to: string) =>
    location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[100rem] items-center gap-2 px-4 lg:px-8">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <img src={logo} alt="etriplesoft" className="h-8 w-auto dark:hidden" />
            <img src={logoDark} alt="etriplesoft" className="hidden h-8 w-auto dark:block" />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 rounded-full border border-border/70 bg-muted/50 p-1 lg:flex">
            {NAV.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            Search
            <kbd className="ml-2 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 sm:ml-1">
            <ThemeToggle />
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:flex"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>

            <DropdownMenu
              trigger={
                <button className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-2 ring-transparent transition-all hover:ring-primary/30">
                  {initials}
                </button>
              }
            >
              {(close) => (
                <>
                  <div className="mx-1.5 mb-1 px-2.5 py-1.5">
                    <div className="truncate text-sm font-medium text-foreground">
                      {profile?.full_name ?? profile?.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {organization?.name ?? "Workspace"}
                    </div>
                  </div>
                  <div className="mx-3 mb-1 h-px bg-border" />
                  {isOwner && (
                    <DropdownItem
                      icon={<Settings className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        navigate("/settings");
                      }}
                    >
                      Settings
                    </DropdownItem>
                  )}
                  <DropdownItem
                    icon={<UsersRound className="h-4 w-4" />}
                    onSelect={() => {
                      close();
                      navigate("/team");
                    }}
                  >
                    Team
                  </DropdownItem>
                  <DropdownItem
                    icon={<LogOut className="h-4 w-4" />}
                    destructive
                    onSelect={() => {
                      close();
                      handleSignOut();
                    }}
                  >
                    Sign out
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="animate-slide-up border-t border-border bg-background px-4 py-3 lg:hidden">
            <div className="grid grid-cols-2 gap-1.5">
              {NAV.map((item) => {
                const active = isActive(item.to);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-6 lg:px-8">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        showSettings={isOwner}
      />
    </div>
  );
}
