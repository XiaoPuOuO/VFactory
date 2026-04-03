import { describe, expect, it } from "vitest";
import { ecpayBuildCheckMacValue, ecpayVerifyCheckMacValue } from "../billing/ecpay-mac.ts";

describe("ecpay CheckMacValue", () => {
  const hashKey = "testHashKey1234567890123456789012";
  const hashIv = "testHashIv1234567";

  it("verifies a freshly built CheckMacValue", () => {
    const params: Record<string, string> = {
      MerchantID: "2000132",
      MerchantTradeNo: "no1",
      RtnCode: "1",
      RtnMsg: "OK",
    };
    const mac = ecpayBuildCheckMacValue(params, hashKey, hashIv);
    const withMac = { ...params, CheckMacValue: mac };
    expect(ecpayVerifyCheckMacValue(withMac, hashKey, hashIv)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const params: Record<string, string> = {
      MerchantID: "2000132",
      MerchantTradeNo: "no1",
      RtnCode: "1",
    };
    const mac = ecpayBuildCheckMacValue(params, hashKey, hashIv);
    const tampered = { ...params, RtnCode: "0", CheckMacValue: mac };
    expect(ecpayVerifyCheckMacValue(tampered, hashKey, hashIv)).toBe(false);
  });

  it("rejects missing CheckMacValue", () => {
    expect(ecpayVerifyCheckMacValue({ a: "1" }, hashKey, hashIv)).toBe(false);
  });
});
