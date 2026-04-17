import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "../adapters/local-self-hosted-llm/execute.js";

describe("local_self_hosted_llm execute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to chat/completions and emits JSONL stdout transcript", async () => {
    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
        expect(init?.method).toBe("POST");
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
        expect(body).toMatchObject({
          model: "llama3.1",
          stream: false,
          messages: [{ role: "user", content: "You are an agent." }],
        });

        return new Response(
          JSON.stringify({
            id: "chatcmpl-1",
            model: "llama3.1",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "hello from ollama",
                },
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 4,
              total_tokens: 16,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const result = await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Self Hosted",
        adapterType: "local_self_hosted_llm",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
        promptTemplate: "You are an agent.",
      },
      context: {},
      onLog: async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.model).toBe("llama3.1");
    expect(result.usage?.inputTokens).toBe(12);
    expect(result.usage?.outputTokens).toBe(4);
    expect(
      logs.some((entry) => entry.stream === "stdout" && entry.chunk.includes("local_self_hosted_llm.result")),
    ).toBe(true);
    const stdoutLine = logs.find((e) => e.stream === "stdout" && e.chunk.includes("local_self_hosted_llm.result"));
    expect(stdoutLine?.chunk.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(stdoutLine!.chunk.trimEnd());
    expect(parsed.type).toBe("local_self_hosted_llm.result");
    expect(parsed.text).toBe("hello from ollama");
  });

  it("sends Authorization when apiKey is set", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers;
      const auth =
        headers instanceof Headers
          ? headers.get("authorization")
          : typeof headers === "object" && headers !== null && !Array.isArray(headers)
            ? (headers as Record<string, string>)["authorization"] ??
              (headers as Record<string, string>)["Authorization"]
            : undefined;
      expect(auth).toBe("Bearer secret-token");
      return new Response(
        JSON.stringify({
          model: "m",
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await execute({
      runId: "run-2",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Self Hosted",
        adapterType: "local_self_hosted_llm",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "m",
        promptTemplate: "hi",
        apiKey: "secret-token",
      },
      context: {},
      onLog: async () => {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
