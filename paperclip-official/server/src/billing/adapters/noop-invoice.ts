import type {
  AllowanceInvoiceInput,
  InvoiceIssuanceProvider,
  IssueInvoiceInput,
  IssueInvoiceResult,
  VoidInvoiceInput,
} from "../ports.js";

/** 未啟用發票加值中心時使用。 */
export function createNoopInvoiceProvider(): InvoiceIssuanceProvider {
  return {
    id: "noop",
    async issue(_input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
      return { ok: true, skipped: true, reason: "invoice_provider_disabled" };
    },
    async voidInvoice(_input: VoidInvoiceInput): Promise<IssueInvoiceResult> {
      return { ok: true, skipped: true, reason: "invoice_provider_disabled" };
    },
    async allowance(_input: AllowanceInvoiceInput): Promise<IssueInvoiceResult> {
      return { ok: true, skipped: true, reason: "invoice_provider_disabled" };
    },
  };
}
