import { ComplianceTabs } from "@/components/dashboard/compliance/compliance-tabs";

export const dynamic = "force-dynamic";

export default function CompliancePage() {
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Manage GDPR, EU AI Act transparency, and data retention settings for
          your tenant.
        </p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium text-amber-700 dark:text-amber-400">
          Not legal advice
        </p>
        <p className="mt-1 text-muted-foreground">
          The templates, policies, and settings on this page help you meet
          common GDPR and EU AI Act obligations, but they are not legal advice
          and do not guarantee compliance. Have a qualified EU data protection
          lawyer review every generated document before use.
        </p>
      </div>

      <ComplianceTabs />
    </main>
  );
}
