import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockTenant, mockAssistant, mockUser } from "@/lib/mock/data";
import type { Tenant, Assistant } from "@bizassist/types";

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface SessionContext {
  user: SessionUser;
  tenant: Tenant;
  assistant: Assistant | null;
}

/** Get the authenticated Supabase user (no DB needed). */
async function getAuthUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    name: (user.user_metadata?.name as string) ?? "",
  };
}

/** Get full session context: user + tenant + assistant. */
export async function getSessionContext(): Promise<SessionContext | null> {
  if (!hasDatabase()) {
    return {
      user: mockUser,
      tenant: mockTenant,
      assistant: mockAssistant,
    };
  }

  const user = await getAuthUser();
  if (!user) return null;

  try {
    let tenant = await queries.getTenantForUser(user.id);
    let assistant: Assistant | null = null;

    if (!tenant) {
      // First login — auto-create tenant + default assistant
      const emailPrefix = user.email.split("@")[0] ?? "my-business";
      const slug = emailPrefix.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const name = user.name || emailPrefix;

      const result = await queries.createTenantWithAssistant(
        user.id,
        name,
        slug,
      );
      tenant = result.tenant;
      assistant = result.assistant;
    } else {
      assistant = await queries.getAssistantForTenant(tenant.id);
    }

    if (!tenant) return null;
    return { user, tenant, assistant };
  } catch (err) {
    console.error("DB error in getSessionContext:", err);
    // DB failed but user IS authenticated — return null so pages use mock
    return null;
  }
}

/**
 * Get session for API routes — returns user even if DB tenant lookup fails.
 * Use this in API routes to avoid false 401s on DB errors.
 */
export async function getApiSession(): Promise<{
  user: SessionUser;
  tenantId?: string;
} | null> {
  if (!hasDatabase()) {
    return { user: mockUser, tenantId: mockTenant.id };
  }

  const user = await getAuthUser();
  if (!user) return null;

  try {
    const tenant = await queries.getTenantForUser(user.id);
    return { user, tenantId: tenant?.id };
  } catch (err) {
    console.error("DB error in getApiSession:", err);
    // User is authenticated, just can't resolve tenant
    return { user };
  }
}
