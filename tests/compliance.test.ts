import { describe, it, expect, beforeAll } from "vitest";
import { signEmail, verifyToken, unsubscribeUrl } from "@/lib/compliance/unsubscribe";
import { buildHtmlFooter, unsubscribeHeaders } from "@/lib/compliance/footer";
import { renderMergeTokens, composeCompliantEmail } from "@/lib/email/render";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  process.env.APP_BASE_URL = "https://app.test";
});

describe("unsubscribe tokens", () => {
  it("verifies a valid token and rejects a forged one", () => {
    const email = "user@example.com";
    const token = signEmail(email);
    expect(verifyToken(email, token)).toBe(true);
    expect(verifyToken(email, "deadbeef")).toBe(false);
    expect(verifyToken("other@example.com", token)).toBe(false);
  });

  it("is case-insensitive on the email", () => {
    const token = signEmail("USER@example.com");
    expect(verifyToken("user@example.com", token)).toBe(true);
  });

  it("builds an unsubscribe URL with email + token", () => {
    const url = unsubscribeUrl("user@example.com");
    expect(url).toContain("https://app.test/api/unsubscribe");
    expect(url).toContain("email=user%40example.com");
    expect(url).toContain("token=");
  });
});

describe("footer", () => {
  it("includes postal address and unsubscribe link", () => {
    const html = buildHtmlFooter({
      recipientEmail: "user@example.com",
      postalAddress: "123 Example St, City",
      fromName: "Acme",
    });
    expect(html).toContain("123 Example St, City");
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("/api/unsubscribe");
  });

  it("provides one-click List-Unsubscribe headers", () => {
    const headers = unsubscribeHeaders("user@example.com");
    expect(headers["List-Unsubscribe"]).toContain("/api/unsubscribe");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("merge tokens", () => {
  it("replaces known tokens and blanks unknown ones", () => {
    const out = renderMergeTokens("Hi {{name}} at {{company}} {{bogus}}", {
      name: "Jane",
      company: "Acme",
      email: "j@a.com",
    });
    expect(out).toBe("Hi Jane at Acme ");
  });

  it("falls back to 'there' when name missing", () => {
    const out = renderMergeTokens("Hi {{name}}", { email: "j@a.com" });
    expect(out).toBe("Hi there");
  });
});

describe("composeCompliantEmail", () => {
  it("always appends footer + headers", () => {
    const msg = composeCompliantEmail({
      to: "user@example.com",
      fromName: "Acme",
      fromEmail: "outreach@acme.com",
      subject: "Hello {{name}}",
      bodyHtml: "<p>Hi {{name}}</p>",
      postalAddress: "123 Example St",
      vars: { name: "Jane", email: "user@example.com" },
    });
    expect(msg.subject).toBe("Hello Jane");
    expect(msg.html).toContain("Hi Jane");
    expect(msg.html).toContain("Unsubscribe");
    expect(msg.html).toContain("123 Example St");
    expect(msg.from).toBe("Acme <outreach@acme.com>");
    expect(msg.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(msg.text).toContain("Unsubscribe:");
  });
});
