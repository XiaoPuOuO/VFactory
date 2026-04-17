import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildLocalSelfHostedLlmConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  const cwd = typeof v.cwd === "string" ? v.cwd.trim() : "";
  if (cwd) ac.cwd = cwd;
  const promptTemplate = typeof v.promptTemplate === "string" ? v.promptTemplate.trim() : "";
  if (promptTemplate) ac.promptTemplate = promptTemplate;
  if (v.baseUrl) ac.baseUrl = v.baseUrl;
  if (v.model) ac.model = v.model;
  const apiKey =
    typeof v.envBindings?.apiKey === "string" ? v.envBindings.apiKey.trim() : "";
  if (apiKey) ac.apiKey = apiKey;
  ac.timeoutSec = 30;
  ac.graceSec = 15;
  return ac;
}
