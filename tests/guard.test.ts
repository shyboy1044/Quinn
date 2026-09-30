import { describe, it, expect } from "vitest";
import { checkSendAllowedSync, isValidEmail, humanReason } from "@/lib/compliance/guard";

const ctx = {
  postalAddress: "123 Example St, City, ST 00000, Country",
  fromEmail: "outreach@example.com",
  fromName: "Your Company",
};

describe("send guard (sync)", () => {
  it("allows a US contact with no consent (CAN-SPAM permits opt-out model)", () => {
    const r = checkSendAllowedSync(
      { email: "a@us.com", region: "US", consentStatus: "none" },
      ctx,
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks an EU contact without consent (GDPR)", () => {
    const r = checkSendAllowedSync(
      { email: "a@eu.eu", region: "EU", consentStatus: "none" },
      ctx,
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("consent-required:EU");
  });

  it("allows an EU contact WITH express consent", () => {
    const r = checkSendAllowedSync(
      { email: "a@eu.eu", region: "EU", consentStatus: "express" },
      ctx,
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks a Canada contact without consent (CASL)", () => {
    const r = checkSendAllowedSync(
      { email: "a@ca.ca", region: "CA", consentStatus: "none" },
      ctx,
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("consent-required:CA");
  });

  it("blocks when postal address is missing (CAN-SPAM)", () => {
    const r = checkSendAllowedSync(
      { email: "a@us.com", region: "US", consentStatus: "express" },
      { ...ctx, postalAddress: "" },
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("missing-postal-address");
  });

  it("blocks an invalid recipient address", () => {
    const r = checkSendAllowedSync(
      { email: "not-an-email", region: "US", consentStatus: "express" },
      ctx,
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("invalid-email");
  });

  it("blocks an invalid From address", () => {
    const r = checkSendAllowedSync(
      { email: "a@us.com", region: "US", consentStatus: "express" },
      { ...ctx, fromEmail: "broken" },
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("invalid-from-address");
  });
});

describe("helpers", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
  });
  it("humanizes reasons", () => {
    expect(humanReason("consent-required:EU")).toContain("EU");
    expect(humanReason("suppressed:bounce")).toContain("bounce");
  });
});
