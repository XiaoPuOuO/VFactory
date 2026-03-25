import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyApprovalPolicies } from "@paperclipai/db";

export type CompanyApprovalPolicyRow = typeof companyApprovalPolicies.$inferSelect;

async function selectPolicyForCompany(
  db: Db,
  companyId: string,
  approvalType: string = "hire_agent",
): Promise<CompanyApprovalPolicyRow | null> {
  return db
    .select()
    .from(companyApprovalPolicies)
    .where(
      and(
        eq(companyApprovalPolicies.companyId, companyId),
        eq(companyApprovalPolicies.approvalType, approvalType),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

export function companyApprovalPolicyService(db: Db) {
  async function upsertPolicy(
    companyId: string,
    input: {
      approvalType: string;
      enabled: boolean;
      maxBudgetMonthlyCents: number | null;
    },
  ): Promise<CompanyApprovalPolicyRow> {
    const existing = await db
      .select()
      .from(companyApprovalPolicies)
      .where(
        and(
          eq(companyApprovalPolicies.companyId, companyId),
          eq(companyApprovalPolicies.approvalType, input.approvalType),
        ),
      )
      .then((rows) => rows[0] ?? null);
    const now = new Date();
    if (existing) {
      const rows = await db
        .update(companyApprovalPolicies)
        .set({
          enabled: input.enabled,
          maxBudgetMonthlyCents: input.maxBudgetMonthlyCents,
          updatedAt: now,
        })
        .where(eq(companyApprovalPolicies.id, existing.id))
        .returning();
      return rows[0]!;
    }
    const rows = await db
      .insert(companyApprovalPolicies)
      .values({
        companyId,
        approvalType: input.approvalType,
        enabled: input.enabled,
        maxBudgetMonthlyCents: input.maxBudgetMonthlyCents,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rows[0]!;
  }

  return {
    async getForCompany(companyId: string, approvalType: string = "hire_agent") {
      return selectPolicyForCompany(db, companyId, approvalType);
    },

    async listAllForCompany(companyId: string) {
      return db
        .select()
        .from(companyApprovalPolicies)
        .where(eq(companyApprovalPolicies.companyId, companyId));
    },

    /**
     * 若政策啟用且請求預算不超過上限，回傳政策列與寫入 snapshot 用物件。
     */
    evaluateHireBudget(
      policy: CompanyApprovalPolicyRow | null,
      requestedBudgetMonthlyCents: number,
    ): { policy: CompanyApprovalPolicyRow; snapshot: Record<string, unknown> } | null {
      if (!policy?.enabled) return null;
      const max = policy.maxBudgetMonthlyCents;
      if (max == null || !Number.isFinite(max) || max < 0) return null;
      if (!Number.isFinite(requestedBudgetMonthlyCents) || requestedBudgetMonthlyCents > max) {
        return null;
      }
      return {
        policy,
        snapshot: {
          approvalType: policy.approvalType,
          maxBudgetMonthlyCents: max,
          requestedBudgetMonthlyCents,
        },
      };
    },

    upsertPolicy,

    async upsertHirePolicy(
      companyId: string,
      input: { enabled: boolean; maxBudgetMonthlyCents: number | null },
    ): Promise<CompanyApprovalPolicyRow> {
      return upsertPolicy(companyId, {
        approvalType: "hire_agent",
        enabled: input.enabled,
        maxBudgetMonthlyCents: input.maxBudgetMonthlyCents,
      });
    },
  };
}
