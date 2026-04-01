import type { RequestHandler } from "express";
import { observeHttpRequest } from "../telemetry/prometheus.js";

/**
 * Records request duration and status for Prometheus SLI histograms / 5xx counters.
 */
export function observabilityHttpMetrics(): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const seconds = (Date.now() - start) / 1000;
      const route = (req as { route?: { path?: string } }).route?.path ?? req.path ?? "unknown";
      observeHttpRequest(req.method, route, res.statusCode, seconds);
    });
    next();
  };
}
