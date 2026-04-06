import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getSessionContext } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();

  return (
    <SidebarProvider>
      <AppSidebar
        tenantName={ctx?.tenant.name ?? "BizAssist"}
        planName={ctx?.tenant.plan ?? "starter"}
      />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
