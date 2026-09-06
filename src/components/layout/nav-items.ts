import {
  LayoutDashboard,
  Rocket,
  Users,
  Upload,
  BarChart3,
  Kanban,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Omit for "everyone". */
  roles?: string[];
}

const ALL_NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", to: "/campaigns", icon: Rocket },
  { label: "Leads", to: "/leads", icon: Users },
  { label: "Pipeline", to: "/crm", icon: Kanban },
  { label: "Tasks", to: "/tasks", icon: ClipboardList },
  { label: "Import", to: "/import", icon: Upload },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
];

// The Tech role only needs its own task queue — everything else in the
// CRM/campaign flow is outside what they're here to do.
const TECH_NAV: NavItem[] = ALL_NAV.filter((item) => item.to === "/tasks");

export function navForRole(role: string | null | undefined): NavItem[] {
  return role === "tech" ? TECH_NAV : ALL_NAV;
}

// Kept for any existing import expecting the full, unfiltered list.
export const NAV = ALL_NAV;
