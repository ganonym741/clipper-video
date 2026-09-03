import { describe, expect, it } from "vitest";
import { createDeviceToken, hashDeviceToken } from "@/lib/anonymous-device";

describe("anonymous device helpers", () => {
  it("creates anonymous tokens and hashes them consistently", () => {
    const token = createDeviceToken();

    expect(token).toMatch(/^anon_/);
    expect(hashDeviceToken(token)).toBe(hashDeviceToken(token));
    expect(hashDeviceToken(token)).not.toBe(token);
  });
});
