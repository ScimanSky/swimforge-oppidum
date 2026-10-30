import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import swaggerSpec from "./swagger-setup";

describe("API docs and legal texts", () => {
  it("give the real contact address", () => {
    expect((swaggerSpec as { info: { contact: { email: string } } }).info.contact.email).toBe("admin@swimforge.it");
  });

  it("keep the legal texts only in client/src/content/legal (no stale root copies)", () => {
    const root = path.resolve(import.meta.dirname, "..");
    for (const stale of ["PRIVACY_POLICY.md", "COOKIE_POLICY.md", "TERMS_OF_SERVICE.md"]) {
      expect(existsSync(path.join(root, stale))).toBe(false);
    }
    for (const current of ["privacy.md", "cookies.md", "terms.md"]) {
      expect(existsSync(path.join(root, "client/src/content/legal", current))).toBe(true);
    }
  });
});
