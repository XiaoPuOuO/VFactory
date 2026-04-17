import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companySubscriptions, plans } from "@paperclipai/db";
import type { PaymentProviderId } from "@paperclipai/db";
import { planSelectableByCompany } from "../services/billing/plan-visibility.js";

export async function upsertCompanySubscription(
  db: Db,
  row: {
    companyId: string;
    planId: string;
    paymentProvider: PaymentProviderId;
    status: string;
    externalCustomerId?: string | null;
    externalSubscriptionId?: string | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const existing = await db
    .select({ id: companySubscriptions.id })
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, row.companyId))
    .then((r) => r[0] ?? null);

  if (existing) {
    await db
      .update(companySubscriptions)
      .set({
        planId: row.planId,
        paymentProvider: row.paymentProvider,
        status: row.status,
        externalCustomerId: row.externalCustomerId ?? null,
        externalSubscriptionId: row.externalSubscriptionId ?? null,
        currentPeriodEnd: row.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
        metadata: row.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(companySubscriptions.companyId, row.companyId));
    return;
  }

  await db.insert(companySubscriptions).values({
    companyId: row.companyId,
    planId: row.planId,
    paymentProvider: row.paymentProvider,
    status: row.status,
    externalCustomerId: row.externalCustomerId ?? null,
    externalSubscriptionId: row.externalSubscriptionId ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
    metadata: row.metadata ?? null,
  });
}

export async function findPlanBySlug(db: Db, slug: string) {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.slug, slug), eq(plans.active, true)))
    .then((r) => r[0] ?? null);
}

export async function findPlanById(db: Db, planId: string) {
  return db.select().from(plans).where(eq(plans.id, planId)).then((r) => r[0] ?? null);
}

export function assertPlanSelectableByCompany(
  plan: typeof plans.$inferSelect,
  companyId: string,
): void {
  if (!planSelectableByCompany(plan, companyId)) {
    throw new Error("Plan is not available for this company");
  }
}
