"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();

  function handleChange(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tenantId", value);
    router.push(`/analytics?${params.toString()}`);
  }

  return (
    <Select value={selectedId} onValueChange={handleChange}>
      <SelectTrigger className="min-w-[180px]" aria-label="Select customer">
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
