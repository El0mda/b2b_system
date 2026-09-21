import {
  LayoutDashboard,
  Rocket,
  Users,
  BarChart3,
  Kanban,
  Layers,
  ListChecks,
  Inbox,
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
  { label: "Inbox", to: "/inbox", icon: Inbox },
  { label: "Sequences", to: "/sequences", icon: Layers },
  { label: "Pipeline", to: "/crm", icon: Kanban },
  { label: "Tasks", to: "/tasks", icon: ListChecks },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
];
