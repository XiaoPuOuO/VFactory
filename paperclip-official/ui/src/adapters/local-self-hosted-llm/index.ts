import type { UIAdapterModule } from "../types";
import { LocalSelfHostedLlmConfigFields } from "./config-fields";
import { buildLocalSelfHostedLlmConfig } from "./build-config";
import { parseLocalSelfHostedLlmStdoutLine } from "./parse-stdout";

export const localSelfHostedLlmUIAdapter: UIAdapterModule = {
  type: "local_self_hosted_llm",
  label: "Local Self-Hosted LLM",
  parseStdoutLine: parseLocalSelfHostedLlmStdoutLine,
  ConfigFields: LocalSelfHostedLlmConfigFields,
  buildAdapterConfig: buildLocalSelfHostedLlmConfig,
};
