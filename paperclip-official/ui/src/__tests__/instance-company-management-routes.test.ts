// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("instance company management route consolidation", () => {
  it("redirects legacy instance settings routes to /instance/companies", () => {
    const appTsxPath = path.join(process.cwd(), "src", "App.tsx");
    const source = fs.readFileSync(appTsxPath, "utf8");

    expect(source).toContain('path="instance/default-company-path"');
    expect(source).toContain('path="instance/archive-company"');
    expect(source).toContain('<Navigate to="/instance/companies" replace />');

    expect(source).not.toContain("DefaultCompanyPathSettings");
    expect(source).not.toContain("ArchiveCompanySettings");
  });
});
