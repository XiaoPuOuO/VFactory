import { randomBytes } from "node:crypto";
import type { Db } from "@paperclipai/db";
import type { BillingCheckoutProvider } from "@paperclipai/shared";
import type { CheckoutSessionResult, CreateCheckoutInput, PaymentProvider } from "../ports.js";
import { ecpayBuildCheckMacValue } from "../ecpay-mac.js";
import { assertPlanSelectableByCompany, findPlanBySlug } from "../subscription-store.js";

function formatMerchantTradeDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function createEcpayPaymentAdapter(
  db: Db,
  opts: {
    merchantId: string;
    hashKey: string;
    hashIv: string;
    /** AIO 收銀台 URL */
    actionUrl: string;
    /** 伺服器 Notify（後端接收付款結果） */
    notifyUrl: string;
    /** 使用者完成後導回（可選） */
    clientBackUrl?: string;
  },
): PaymentProvider {
  const { merchantId, hashKey, hashIv, actionUrl, notifyUrl, clientBackUrl } = opts;

  return {
    id: "ecpay" as BillingCheckoutProvider,

    async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
      if (input.currency !== "twd") {
        throw new Error("ECPay adapter only supports TWD");
      }
      const plan = await findPlanBySlug(db, input.planSlug);
      if (!plan) {
        throw new Error("Plan not found or inactive");
      }
      assertPlanSelectableByCompany(plan, input.companyId);
      const amountRef = plan.externalRefs?.amount_twd ?? plan.externalRefs?.ecpay_amount_twd;
      const totalAmount = amountRef && amountRef.trim() !== "" ? amountRef.trim() : "100";

      const tradeNo = `PC${Date.now()}${randomBytes(3).toString("hex")}`.slice(0, 20);
      const fields: Record<string, string> = {
        MerchantID: merchantId,
        MerchantTradeNo: tradeNo,
        MerchantTradeDate: formatMerchantTradeDate(new Date()),
        PaymentType: "aio",
        TotalAmount: totalAmount,
        TradeDesc: `Paperclip ${plan.name}`,
        ItemName: plan.name,
        ReturnURL: notifyUrl,
        ChoosePayment: "ALL",
        EncryptType: "1",
        CustomField1: input.companyId,
        CustomField2: input.planSlug,
        CustomField3: input.tenantSlug,
      };
      if (clientBackUrl) {
        fields.ClientBackURL = clientBackUrl;
      }
      fields.CheckMacValue = ecpayBuildCheckMacValue(fields, hashKey, hashIv);

      return { kind: "ecpay_form", actionUrl, fields };
    },
  };
}
