import type { RequestHandler } from "express";
import type { Db } from "@paperclipai/db";
import { billingFacade } from "./facade.js";
import { loadBillingFactoryConfigFromEnv } from "./factory.js";
import { logger } from "../middleware/logger.js";

export function stripeBillingWebhookMiddleware(db: Db): RequestHandler {
  const bill = billingFacade(db);
  return async (req, res) => {
    try {
      const raw = req.body;
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw ?? {}));
      await bill.applyStripeWebhook(buf, req.header("stripe-signature"));
      res.json({ received: true });
    } catch (err) {
      logger.warn({ err }, "stripe billing webhook error");
      res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

export function ecpayBillingWebhookMiddleware(db: Db): RequestHandler {
  const bill = billingFacade(db);
  const cfg = loadBillingFactoryConfigFromEnv();
  return async (req, res) => {
    if (!cfg.ecpayHashKey || !cfg.ecpayHashIv) {
      res.status(503).send("0|ECPayNotConfigured");
      return;
    }
    const params = req.body as Record<string, string>;
    try {
      const out = await bill.applyEcpayNotify(params, cfg.ecpayHashKey, cfg.ecpayHashIv);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(out);
    } catch (err) {
      logger.error({ err }, "ecpay billing webhook error");
      res.status(500).send("0|ServerError");
    }
  };
}
