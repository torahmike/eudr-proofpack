import type { OrganizationRow } from "../db/types";

export type BillingPlanId = "starter" | "growth" | "consultant" | "enterprise";

interface PlanLimits {
  activeProofPacks: number | null;
  members: number | null;
}

interface PlanDefinition {
  id: BillingPlanId;
  name: string;
  priceMonthlyEur: number | null;
  limits: PlanLimits;
}

export interface BillingUsage {
  activeProofPacks: number;
  totalProofPacks: number;
  members: number;
}

export interface BillingSummary {
  plan: PlanDefinition;
  status: string;
  billingAccessActive: boolean;
  usage: BillingUsage;
  extraProofPackAllowance: number;
  effectiveLimits: PlanLimits;
  canCreateProofPack: boolean;
  canAddMember: boolean;
}

export interface LimitCheck {
  ok: boolean;
  message?: string;
  summary: BillingSummary;
}

const plans: Record<BillingPlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthlyEur: 49,
    limits: { activeProofPacks: 5, members: 1 },
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthlyEur: 149,
    limits: { activeProofPacks: 25, members: 5 },
  },
  consultant: {
    id: "consultant",
    name: "Consultant",
    priceMonthlyEur: 399,
    limits: { activeProofPacks: 100, members: 15 },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthlyEur: null,
    limits: { activeProofPacks: null, members: null },
  },
};

export function getPlan(planId: string | null | undefined): PlanDefinition {
  return plans[isBillingPlan(planId) ? planId : "starter"];
}

export async function getBillingSummary(env: Env, organization: OrganizationRow): Promise<BillingSummary> {
  const plan = getPlan(organization.billing_plan);
  const status = organization.billing_status ?? "active";
  const billingAccessActive = status === "active" || status === "trialing";
  const usage = await getBillingUsage(env, organization.id);
  const extraProofPackAllowance = Math.max(0, organization.extra_proof_pack_allowance ?? 0);
  const activeProofPacks = plan.limits.activeProofPacks === null ? null : plan.limits.activeProofPacks + extraProofPackAllowance;
  const effectiveLimits = { activeProofPacks, members: plan.limits.members };
  return {
    plan,
    status,
    billingAccessActive,
    usage,
    extraProofPackAllowance,
    effectiveLimits,
    canCreateProofPack: billingAccessActive && withinLimit(usage.activeProofPacks, effectiveLimits.activeProofPacks),
    canAddMember: billingAccessActive && withinLimit(usage.members, effectiveLimits.members),
  };
}

export async function checkProofPackLimit(env: Env, organization: OrganizationRow): Promise<LimitCheck> {
  const summary = await getBillingSummary(env, organization);
  if (summary.canCreateProofPack) return { ok: true, summary };
  return {
    ok: false,
    summary,
    message: summary.billingAccessActive
      ? `${summary.plan.name} includes ${summary.effectiveLimits.activeProofPacks} active proof packs. Archive a pack, add extra proof packs, or upgrade to create another.`
      : `Billing is ${summary.status}. Update billing before creating another proof pack.`,
  };
}

export async function checkMemberLimit(env: Env, organization: OrganizationRow): Promise<LimitCheck> {
  const summary = await getBillingSummary(env, organization);
  if (summary.canAddMember) return { ok: true, summary };
  return {
    ok: false,
    summary,
    message: summary.billingAccessActive
      ? `${summary.plan.name} includes ${summary.effectiveLimits.members} users. Upgrade before inviting another teammate.`
      : `Billing is ${summary.status}. Update billing before inviting another teammate.`,
  };
}

async function getBillingUsage(env: Env, organizationId: string): Promise<BillingUsage> {
  const [packRow, memberRow] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_proof_packs,
         SUM(CASE WHEN status != 'archived' THEN 1 ELSE 0 END) AS active_proof_packs
       FROM proof_packs WHERE organization_id = ?`,
    )
      .bind(organizationId)
      .first<{ total_proof_packs: number; active_proof_packs: number | null }>(),
    env.DB.prepare(`SELECT COUNT(*) AS members FROM organization_members WHERE organization_id = ?`).bind(organizationId).first<{ members: number }>(),
  ]);
  return {
    activeProofPacks: packRow?.active_proof_packs ?? 0,
    totalProofPacks: packRow?.total_proof_packs ?? 0,
    members: memberRow?.members ?? 0,
  };
}

function isBillingPlan(value: string | null | undefined): value is BillingPlanId {
  return value === "starter" || value === "growth" || value === "consultant" || value === "enterprise";
}

function withinLimit(current: number, limit: number | null): boolean {
  return limit === null || current < limit;
}
