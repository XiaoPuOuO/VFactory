// @vitest-environment node

import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import zhTW from "../locales/zh-TW.json";

describe("local self-hosted LLM locale strings", () => {
  it("exposes onboarding strings in both locales", () => {
    expect(en.onboarding.localSelfHostedLlm).toBeDefined();
    expect(zhTW.onboarding.localSelfHostedLlm).toBeDefined();

    expect(en.onboarding.localSelfHostedLlmAgent).toBeDefined();
    expect(zhTW.onboarding.localSelfHostedLlmAgent).toBeDefined();

    expect(en.onboarding.localSelfHostedBaseUrl).toBeDefined();
    expect(zhTW.onboarding.localSelfHostedBaseUrl).toBeDefined();

    expect(en.onboarding.localSelfHostedModelRequired).toBeDefined();
    expect(zhTW.onboarding.localSelfHostedModelRequired).toBeDefined();
    expect(en.onboarding.localSelfHostedEnvFailHint).toBeDefined();
    expect(zhTW.onboarding.localSelfHostedEnvFailHint).toBeDefined();
  });
});
