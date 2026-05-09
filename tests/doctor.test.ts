import { describe, expect, it } from "vitest";

import { formatDoctorResult, type DoctorResult } from "../src/doctor.js";

describe("formatDoctorResult", () => {
  it("formats successful checks", () => {
    const result: DoctorResult = {
      ok: true,
      checks: [
        {
          name: "Patchright Chromium installation",
          ok: true,
          message: "Chromium executable exists.",
          detail: "/tmp/chromium",
        },
      ],
    };

    expect(formatDoctorResult(result)).toBe([
      "Feedloom doctor",
      "✓ Patchright Chromium installation: Chromium executable exists.",
      "  /tmp/chromium",
      "OK",
    ].join("\n"));
  });

  it("formats failed checks with hints", () => {
    const result: DoctorResult = {
      ok: false,
      checks: [
        {
          name: "Patchright Chromium installation",
          ok: false,
          message: "Chromium executable was not found on disk.",
          detail: "/tmp/missing\nENOENT",
          hint: "Run: npx patchright install chromium",
        },
      ],
    };

    expect(formatDoctorResult(result)).toBe([
      "Feedloom doctor",
      "✗ Patchright Chromium installation: Chromium executable was not found on disk.",
      "  /tmp/missing",
      "  ENOENT",
      "  Run: npx patchright install chromium",
      "FAILED",
    ].join("\n"));
  });
});
