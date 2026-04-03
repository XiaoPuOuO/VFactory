import { logger } from "../../middleware/logger.js";
import type {
  AllowanceInvoiceInput,
  InvoiceIssuanceProvider,
  IssueInvoiceInput,
  IssueInvoiceResult,
  VoidInvoiceInput,
} from "../ports.js";

/**
 * 綠界電子發票 Adapter：正式環境需依綠界「電子發票」文件組 RqHeader／加密 Data。
 * 此處提供結構與擴充點；未完整設定時略過開立（skipped），避免誤 call 錯誤端點。
 *
 * 環境變數：
 * - PAPERCLIP_ECPAY_INVOICE_ISSUE_URL：開立 API（POST form 或 JSON，依你方加值設定）
 * - PAPERCLIP_ECPAY_INVOICE_MERCHANT_ID / HASH_KEY / HASH_IV：與金流可相同或獨立
 * - PAPERCLIP_ECPAY_INVOICE_MOCK_OK=true：測試用，回傳假發票號不呼叫外部
 */
export function createEcpayInvoiceAdapterFromEnv(): InvoiceIssuanceProvider {
  const issueUrl = process.env.PAPERCLIP_ECPAY_INVOICE_ISSUE_URL?.trim();
  const merchantId = process.env.PAPERCLIP_ECPAY_INVOICE_MERCHANT_ID?.trim();
  const mockOk = process.env.PAPERCLIP_ECPAY_INVOICE_MOCK_OK?.trim().toLowerCase() === "true";

  return {
    id: "ecpay_invoice",
    async issue(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
      if (mockOk) {
        return {
          ok: true,
          invoiceNumber: "MOCK00000000",
          invoiceDate: new Date().toISOString().slice(0, 10),
          randomCode: "1234",
          raw: { mock: true },
        };
      }
      if (!issueUrl || !merchantId) {
        return {
          ok: true,
          skipped: true,
          reason: "ecpay_invoice_not_configured",
        };
      }
      try {
        const body = new URLSearchParams({
          MerchantID: merchantId,
          RelateNumber: input.orderId.slice(0, 30),
          SalesAmount: String(Math.round(input.amountCents / 100)),
          ItemName: input.items.map((i) => i.name).join("#") || "Service",
          BuyerName: input.buyerName ?? "",
          BuyerUBN: input.buyerIdentifier ?? "",
          CarrierNum: input.carrierNum ?? "",
          LoveCode: input.loveCode ?? "",
        });
        const res = await fetch(issueUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const text = await res.text();
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          json = { raw: text };
        }
        if (!res.ok) {
          return { ok: false, reason: `http_${res.status}`, raw: json };
        }
        return {
          ok: true,
          invoiceNumber: String(json.InvoiceNo ?? json.invoiceNumber ?? ""),
          invoiceDate: String(json.InvoiceDate ?? ""),
          randomCode: String(json.RandomNumber ?? ""),
          raw: json,
        };
      } catch (err) {
        logger.error({ err, orderId: input.orderId }, "ecpay invoice issue fetch failed");
        return { ok: false, reason: err instanceof Error ? err.message : "request_failed" };
      }
    },
    async voidInvoice(input: VoidInvoiceInput): Promise<IssueInvoiceResult> {
      if (!issueUrl || !merchantId) {
        return { ok: true, skipped: true, reason: "ecpay_invoice_not_configured" };
      }
      logger.info({ invoiceNumber: input.invoiceNumber }, "ecpay invoice void requested (adapter stub)");
      return { ok: true, skipped: true, reason: "void_requires_full_ecpay_invoice_api" };
    },
    async allowance(input: AllowanceInvoiceInput): Promise<IssueInvoiceResult> {
      if (!issueUrl || !merchantId) {
        return { ok: true, skipped: true, reason: "ecpay_invoice_not_configured" };
      }
      logger.info({ invoiceNumber: input.invoiceNumber }, "ecpay invoice allowance requested (adapter stub)");
      return { ok: true, skipped: true, reason: "allowance_requires_full_ecpay_invoice_api" };
    },
  };
}
