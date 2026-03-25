/**
 * 與 agent 路由 `withAutoPauseFields` 一致：合併 agent 自身暫停與公司層級 Token/Price 上限。
 */
export function computeAutoPauseFields(
  agent: { status: string; autoPauseReason?: string | null },
  companyReason: "token_limit" | "price_limit" | null,
): { autoPaused: boolean; autoPauseReason: string | null } {
  const paused = agent.status === "paused";
  const autoPaused = paused || Boolean(companyReason);
  const autoPauseReason =
    (paused && agent.autoPauseReason) || companyReason || null;
  return { autoPaused, autoPauseReason };
}
