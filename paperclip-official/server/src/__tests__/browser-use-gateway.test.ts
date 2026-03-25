import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBrowserUseSessionStartToolInput } from "../services/browser-use-gateway.js";

const ORIGINAL_DEBUG = process.env.PAPERCLIP_BROWSER_USE_DEBUG;

function restoreDebugEnv() {
  if (ORIGINAL_DEBUG === undefined) {
    delete process.env.PAPERCLIP_BROWSER_USE_DEBUG;
  } else {
    process.env.PAPERCLIP_BROWSER_USE_DEBUG = ORIGINAL_DEBUG;
  }
}

describe("applyBrowserUseSessionStartToolInput", () => {
  beforeEach(() => {
    delete process.env.PAPERCLIP_BROWSER_USE_DEBUG;
  });

  afterEach(() => {
    restoreDebugEnv();
  });

  it("保留呼叫端明確指定的 headless", () => {
    process.env.PAPERCLIP_BROWSER_USE_DEBUG = "true";
    expect(applyBrowserUseSessionStartToolInput({ headless: true })).toEqual({ headless: true });
    expect(applyBrowserUseSessionStartToolInput({ headless: false })).toEqual({ headless: false });
  });

  it("未指定 headless 且未開 debug 時預設 headless（背景）", () => {
    expect(applyBrowserUseSessionStartToolInput({})).toEqual({ headless: true });
  });

  it("PAPERCLIP_BROWSER_USE_DEBUG 為 true/1/yes 時顯示瀏覽器", () => {
    for (const v of ["true", "1", "yes"]) {
      process.env.PAPERCLIP_BROWSER_USE_DEBUG = v;
      expect(applyBrowserUseSessionStartToolInput({})).toEqual({ headless: false });
    }
  });
});
