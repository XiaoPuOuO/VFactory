import { afterEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../adapters/local-self-hosted-llm/test.js";

describe("local_self_hosted_llm environment test", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails when baseUrl is missing", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "local_self_hosted_llm",
      config: { model: "llama3.1" },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "local_base_url_missing")).toBe(true);
  });

  it("passes when the endpoint responds and the model is listed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        // Regression guard: common Ollama-style baseUrl omits a trailing slash after `/v1`.
        expect(url).toBe("http://127.0.0.1:11434/v1/models");
        return new Response(JSON.stringify({ data: [{ id: "llama3.1", object: "model" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "local_self_hosted_llm",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
      },
    });

    expect(result.status).toBe("pass");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
