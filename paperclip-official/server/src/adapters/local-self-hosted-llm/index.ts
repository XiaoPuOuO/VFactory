import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { sessionCodec } from "./session.js";

export const localSelfHostedLlmAdapter: ServerAdapterModule = {
  type: "local_self_hosted_llm",
  execute,
  testEnvironment,
  sessionCodec,
  models: [],
  agentConfigurationDoc: `# local_self_hosted_llm agent configuration

Adapter: local_self_hosted_llm

Use when:
- The agent should invoke a self-hosted OpenAI-compatible endpoint on the local/private network
- You want to target tools such as Ollama, LM Studio, or vLLM via baseUrl + model

Don't use when:
- You need a local CLI runtime such as Claude Code, Codex CLI, or Cursor
- You need a generic webhook that is not OpenAI-compatible

Core fields:
- baseUrl (string, required): OpenAI-compatible endpoint base, e.g. http://127.0.0.1:11434/v1
- model (string, required): exact model id to send to chat/completions
- promptTemplate (string): user message body sent as the single chat/completions user message
- apiKey (string, optional): bearer token used when the endpoint requires authentication
`,
};
