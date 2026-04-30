"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Users,
  BarChart3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Customers", href: "/customers", icon: Users },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Knowledge Base", href: "/knowledge", icon: BookOpen },
];

interface AppSidebarProps {
  tenantName: string;
  planName: string;
}

export function AppSidebar({ tenantName, planName }: AppSidebarProps) {
  const pathname = usePathname();

  const planLabel =
    planName === "professional"
      ? "Professional Plan"
      : planName === "business"
        ? "Business Plan"
        : "Starter Plan";

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <Link href="/customers" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            B
          </div>
          <span className="text-lg font-semibold">BizAssist AI</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <p className="text-xs text-muted-foreground">{tenantName}</p>
        <p className="text-xs text-muted-foreground">{planLabel}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
