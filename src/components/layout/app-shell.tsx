import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Rocket,
  Users,
  Upload,
  BarChart3,
  Mail,
  Settings,
  UsersRound,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NavChild {
  label: string;
  to: string;
}
interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  children?: NavChild[];
}

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  {
    label: "Campaigns",
    to: "/campaigns",
    icon: Rocket,
    children: [
      { label: "All Campaigns", to: "/campaigns" },
      { label: "New Campaign", to: "/campaigns/new" },
    ],
  },
  { label: "Leads", to: "/leads", icon: Users },
  { label: "Import Leads", to: "/import", icon: Upload },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Sender Accounts", to: "/sender-accounts", icon: Mail },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Team", to: "/team", icon: UsersRound },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/leads": "Leads",
  "/import": "Import Leads",
  "/analytics": "Analytics",
  "/sender-accounts": "Sender Accounts",
  "/settings": "Settings",
  "/team": "Team",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, organization, signOut } = useAuth();

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const title =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith("/campaigns/") ? "Campaign" : "Campaign Commander");

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const Sidebar = (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Rocket className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">Campaign</div>
          <div className="text-sm font-semibold text-white">Commander</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            location.pathname === item.to ||
            (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
          return (
            <div key={item.to}>
              <NavLink
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-white"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
              {item.children && active && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      onClick={() => setMobileOpen(false)}
                      end
                      className={({ isActive }) =>
                        cn(
                          "block rounded px-3 py-1.5 text-xs transition-colors",
                          isActive
                            ? "text-white"
                            : "text-sidebar-foreground/70 hover:text-white",
                        )
                      }
                    >
                      → {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="relative border-t border-sidebar-border">
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sidebar-accent"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-medium text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-white">
              {organization?.name ?? "Workspace"}
            </div>
            <div className="truncate text-[11px] text-sidebar-foreground/70">
              {profile?.full_name ?? profile?.email ?? ""}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-sidebar-foreground/70" />
        </button>
        {userMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-md border border-border bg-white shadow-lg">
            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate("/settings");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <Settings className="h-4 w-4" /> Settings
            </button>
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">{Sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0">{Sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="mx-auto hidden max-w-md flex-1 md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search leads, campaigns..."
                className="border-transparent bg-muted/40 pl-9"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Link
              to="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-white"
            >
              {initials}
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
