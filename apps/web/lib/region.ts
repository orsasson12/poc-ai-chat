/**
 * Region enforcement for multi-region deployments.
 *
 * This module does NOT perform cross-region routing inside a single deployment
 * (that is deliberately out of scope — see docs/compliance/eu-data-residency-architecture.md).
 * Instead, it validates that the tenant's pinned region matches the deployment's
 * configured region so that an EU-only tenant never lands on a US deployment.
 *
 * Deployment topology:
 *   - Two Next.js deployments: one pointing at EU infra (Supabase EU + Pinecone EU),
 *     one pointing at US infra.
 *   - Each deployment sets BIZASSIST_DEPLOY_REGION=eu|us at build time.
 *   - Tenants carry tenants.data_region = eu|us|auto. "auto" matches any deployment.
 */

export type DataRegion = "eu" | "us" | "auto";

export function getDeploymentRegion(): DataRegion {
  const raw = (process.env.BIZASSIST_DEPLOY_REGION ?? "auto").toLowerCase();
  if (raw === "eu" || raw === "us") return raw;
  return "auto";
}

export function isValidDataRegion(value: string | null | undefined): value is DataRegion {
  return value === "eu" || value === "us" || value === "auto";
}

/**
 * Returns true when a tenant pinned to `tenantRegion` is allowed to run on this deployment.
 * "auto" on either side is permissive.
 */
export function tenantAllowedOnDeployment(tenantRegion: string | null): boolean {
  const deploy = getDeploymentRegion();
  if (deploy === "auto") return true;
  if (!tenantRegion || tenantRegion === "auto") return true;
  return tenantRegion === deploy;
}

/**
 * Human label for the UI — "European Union", "United States", "Auto".
 */
export function regionLabel(value: string | null | undefined): string {
  switch (value) {
    case "eu":
      return "European Union";
    case "us":
      return "United States";
    default:
      return "Auto (matches deployment)";
  }
}

/**
 * Throws when a tenant is being accessed on the wrong region deployment.
 * Call at the top of API routes and RSC pages that deal with tenant data.
 */
export function assertTenantRegion(tenantRegion: string | null): void {
  if (!tenantAllowedOnDeployment(tenantRegion)) {
    throw new Error(
      `Tenant pinned to region "${tenantRegion}" cannot be served from the "${getDeploymentRegion()}" deployment.`,
    );
  }
}
