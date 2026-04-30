"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TenantOption {
  id: string;
  name: string;
  conversationCount: number;
}

interface TenantPickerProps {
  tenants: TenantOption[];
  selectedId: string;
}

export function TenantPicker({ tenants, selectedId }: TenantPickerProps) {
  const router = useRouter();

  // The picker is the only thing on /analytics that consumes the tenantId
  // search param, so we don't need to merge with existing params — just
  // navigate to /analytics?tenantId=<new>. Avoids useSearchParams, which
  // forces a Suspense boundary in Next.js 16+.
  function handleChange(value: string | null) {
    if (!value || value === selectedId) return;
    router.push(`/analytics?tenantId=${encodeURIComponent(value)}`);
  }

  return (
    <Select value={selectedId} onValueChange={handleChange}>
      <SelectTrigger className="min-w-[200px]" aria-label="Select customer">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {t.conversationCount} {t.conversationCount === 1 ? "chat" : "chats"}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
