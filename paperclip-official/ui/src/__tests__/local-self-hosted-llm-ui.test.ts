// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getUIAdapter } from "../adapters/registry";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { parseLocalSelfHostedLlmStdoutLine } from "../adapters/local-self-hosted-llm/parse-stdout";

describe("local_self_hosted_llm ui adapter", () => {
  it("builds adapter config with the default local base URL", () => {
    const adapter = getUIAdapter("local_self_hosted_llm");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "local_self_hosted_llm",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(config.model).toBe("llama3.1");
    expect(config.timeoutSec).toBe(30);
    expect(config.graceSec).toBe(15);
  });

  it("includes optional apiKey from envBindings", () => {
    const adapter = getUIAdapter("local_self_hosted_llm");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "local_self_hosted_llm",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "m",
      envBindings: { apiKey: "secret" },
    });
    expect(config.apiKey).toBe("secret");
  });

  it("includes promptTemplate and cwd when provided", () => {
    const adapter = getUIAdapter("local_self_hosted_llm");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "local_self_hosted_llm",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
      promptTemplate: "You are an agent.\n",
      cwd: "/tmp/repo",
    });

    expect(config.promptTemplate).toBe("You are an agent.");
    expect(config.cwd).toBe("/tmp/repo");
  });

  it("parses JSONL result into assistant + result entries", () => {
    const line = JSON.stringify({
      type: "local_self_hosted_llm.result",
      text: "hello",
      inputTokens: 1,
      outputTokens: 2,
      costUsd: 0,
      isError: false,
      errors: [],
    });
    const ts = "2026-01-01T00:00:00.000Z";
    const entries = parseLocalSelfHostedLlmStdoutLine(line, ts);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ kind: "assistant", ts, text: "hello" });
    expect(entries[1]?.kind).toBe("result");
    if (entries[1]?.kind === "result") {
      expect(entries[1].text).toBe("hello");
      expect(entries[1].inputTokens).toBe(1);
      expect(entries[1].outputTokens).toBe(2);
    }
  });

  it("falls back to stdout for non-result lines", () => {
    const ts = "t";
    expect(parseLocalSelfHostedLlmStdoutLine("plain log", ts)).toEqual([
      { kind: "stdout", ts, text: "plain log" },
    ]);
  });
});
