import { describe, expect, it, vi, afterEach } from "vitest";
import {
  resolveWorkflowPromptStepOutput,
  resolveWorkflowPromptCompletionFamily,
  workflowPromptOpenAiApiKey,
  WORKFLOW_PROMPT_SYSTEM,
} from "../services/workflow-prompt-llm.js";

describe("resolveWorkflowPromptStepOutput", () => {
  const envSnapshot = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in envSnapshot)) delete process.env[k];
    }
    Object.assign(process.env, envSnapshot);
    globalThis.fetch = originalFetch;
  });

  it("uses fallback when WORKFLOW_PROMPT_LLM_DISABLED", async () => {
    process.env.WORKFLOW_PROMPT_LLM_DISABLED = "1";
    process.env.OPENAI_API_KEY = "sk-should-not-be-used";
    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "Tell me a joke",
    });
    expect(r).toEqual({ ok: true, text: "", source: "fallback" });
  });

  it("uses fallback when no API key", async () => {
    delete process.env.WORKFLOW_PROMPT_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "x",
    });
    expect(r).toEqual({ ok: true, text: "", source: "fallback" });
  });

  it("calls OpenAI when key is set and returns model text", async () => {
    process.env.WORKFLOW_PROMPT_OPENAI_API_KEY = "sk-test";
    delete process.env.WORKFLOW_PROMPT_LLM_DISABLED;

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "  hello model  " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "Do the thing",
    });

    expect(r.ok && r.source === "openai" && r.text === "hello model").toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(call[1].body as string);
    expect(body.messages[0].content).toBe(WORKFLOW_PROMPT_SYSTEM);
    expect(body.messages[1]).toEqual({ role: "user", content: "Do the thing" });
  });

  it("workflowPromptOpenAiApiKey prefers dedicated env", () => {
    process.env.WORKFLOW_PROMPT_OPENAI_API_KEY = "sk-dedicated";
    process.env.OPENAI_API_KEY = "sk-shared";
    expect(workflowPromptOpenAiApiKey()).toBe("sk-dedicated");
  });

  it("routes claude agent to Anthropic API when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.WORKFLOW_PROMPT_LLM_DISABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WORKFLOW_PROMPT_OPENAI_API_KEY;

    globalThis.fetch = vi.fn(async (url: RequestInfo) => {
      const u = typeof url === "string" ? url : url.toString();
      expect(u).toBe("https://api.anthropic.com/v1/messages");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "  anthropic out  " }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "task",
      fallbackText: "fb",
      agent: { adapterType: "claude_local", adapterConfig: {} },
    });

    expect(r.ok && r.source === "anthropic" && r.text === "anthropic out").toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("routes gemini agent to Gemini API when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "g-key";
    delete process.env.WORKFLOW_PROMPT_LLM_DISABLED;
    delete process.env.OPENAI_API_KEY;

    globalThis.fetch = vi.fn(async (url: RequestInfo) => {
      const u = typeof url === "string" ? url : url.toString();
      expect(u).toContain("generativelanguage.googleapis.com");
      expect(u).toContain(":generateContent");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: " gemini ok " }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "task",
      agent: { adapterType: "gemini_remote", adapterConfig: { model: "gemini-2.0-flash" } },
    });

    expect(r.ok && r.source === "gemini" && r.text === "gemini ok").toBe(true);
  });

  it("does not call OpenAI when claude agent has no Anthropic key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WORKFLOW_PROMPT_OPENAI_API_KEY;

    globalThis.fetch = vi.fn() as typeof fetch;

    const r = await resolveWorkflowPromptStepOutput({
      renderedInstruction: "x",
      agent: { adapterType: "claude_remote", adapterConfig: {} },
    });

    expect(r).toEqual({ ok: true, text: "", source: "fallback" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("resolveWorkflowPromptCompletionFamily", () => {
  it("maps adapter types to completion families", () => {
    expect(resolveWorkflowPromptCompletionFamily("gemini_local", {})).toBe("gemini");
    expect(resolveWorkflowPromptCompletionFamily("claude_remote", {})).toBe("anthropic");
    expect(resolveWorkflowPromptCompletionFamily("codex_local", {})).toBe("openai");
    expect(resolveWorkflowPromptCompletionFamily("cursor", { model: "claude-3-5-sonnet-20241022" })).toBe(
      "anthropic",
    );
    expect(resolveWorkflowPromptCompletionFamily("cursor", { model: "gpt-4o" })).toBe("openai");
    expect(resolveWorkflowPromptCompletionFamily("process", {})).toBe("legacy_openai");
  });
});
