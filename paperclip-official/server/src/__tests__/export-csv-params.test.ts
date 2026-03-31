import { describe, expect, it } from "vitest";
import { csvEscapeCell } from "../lib/export-csv-params.js";

describe("csvEscapeCell", () => {
  it("escapes CSV delimiters and quotes", () => {
    expect(csvEscapeCell("a,b")).toBe('"a,b"');
    expect(csvEscapeCell('a"b')).toBe('"a""b"');
    expect(csvEscapeCell("a\nb")).toBe('"a\nb"');
  });

  it("mitigates spreadsheet formula injection", () => {
    expect(csvEscapeCell("=SUM(1,1)")).toBe("\"'=SUM(1,1)\"");
    expect(csvEscapeCell("+1+1")).toBe("'+1+1");
    expect(csvEscapeCell("-1")).toBe("'-1");
    expect(csvEscapeCell("@A1")).toBe("'@A1");

    // Preserve leading whitespace; inject quote after whitespace.
    expect(csvEscapeCell("   =1+1")).toBe("   '=1+1");
    expect(csvEscapeCell("\t=1+1")).toBe("\t'=1+1");
  });

  it("handles null/undefined", () => {
    expect(csvEscapeCell(null)).toBe("");
    expect(csvEscapeCell(undefined)).toBe("");
  });
});

