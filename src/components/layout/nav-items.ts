import {
  LayoutDashboard,
  Rocket,
  Users,
  Upload,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", to: "/campaigns", icon: Rocket },
  { label: "Leads", to: "/leads", icon: Users },
  { label: "Import", to: "/import", icon: Upload },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
];
