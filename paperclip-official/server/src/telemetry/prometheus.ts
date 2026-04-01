/**
 * 輕量 Prometheus 文字格式指標（無額外 npm 依賴）。
 */

let httpLatencySum = 0;
let httpLatencyCount = 0;

let http5xxTotal = 0;
let scheduleTickErrorsTotal = 0;
let heartbeatTimerErrorsTotal = 0;
const heartbeatRunFailuresBySource: Record<string, number> = {};
let applicationLogWritesTotal = 0;

function incNested(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function observeHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number,
): void {
  void method;
  void route;
  httpLatencySum += durationSeconds;
  httpLatencyCount += 1;
  if (statusCode >= 500) {
    http5xxTotal += 1;
  }
}

export function incScheduleTickErrors(): void {
  scheduleTickErrorsTotal += 1;
}

export function incHeartbeatTimerErrors(): void {
  heartbeatTimerErrorsTotal += 1;
}

export function incHeartbeatRunFailure(invocationSource: string): void {
  incNested(heartbeatRunFailuresBySource, invocationSource || "unknown");
}

export function incApplicationLogWrites(): void {
  applicationLogWritesTotal += 1;
}

export async function renderMetricsText(): Promise<string> {
  const lines: string[] = [];

  lines.push("# HELP paperclip_http_request_duration_seconds HTTP request duration (summary)");
  lines.push("# TYPE paperclip_http_request_duration_seconds summary");
  lines.push(`paperclip_http_request_duration_seconds_sum ${httpLatencySum}`);
  lines.push(`paperclip_http_request_duration_seconds_count ${httpLatencyCount}`);

  lines.push("# HELP paperclip_http_5xx_total Count of HTTP 5xx responses");
  lines.push("# TYPE paperclip_http_5xx_total counter");
  lines.push(`paperclip_http_5xx_total ${http5xxTotal}`);

  lines.push("# HELP paperclip_schedule_tick_errors_total Schedule tick failures");
  lines.push("# TYPE paperclip_schedule_tick_errors_total counter");
  lines.push(`paperclip_schedule_tick_errors_total ${scheduleTickErrorsTotal}`);

  lines.push("# HELP paperclip_heartbeat_timer_errors_total Heartbeat timer tick failures");
  lines.push("# TYPE paperclip_heartbeat_timer_errors_total counter");
  lines.push(`paperclip_heartbeat_timer_errors_total ${heartbeatTimerErrorsTotal}`);

  lines.push("# HELP paperclip_heartbeat_run_failures_total Heartbeat runs failed or timed out");
  lines.push("# TYPE paperclip_heartbeat_run_failures_total counter");
  for (const [src, n] of Object.entries(heartbeatRunFailuresBySource)) {
    lines.push(`paperclip_heartbeat_run_failures_total{invocation_source="${src}"} ${n}`);
  }

  lines.push("# HELP paperclip_application_log_writes_total Rows written to application_log_entries");
  lines.push("# TYPE paperclip_application_log_writes_total counter");
  lines.push(`paperclip_application_log_writes_total ${applicationLogWritesTotal}`);

  return `${lines.join("\n")}\n`;
}
