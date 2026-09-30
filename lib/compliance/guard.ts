import { prisma } from "@/lib/db";

// Regions that legally require prior consent before commercial email
// (GDPR for the EU, CASL for Canada). Cold outreach to these without a
// recorded consent flag is blocked.
const CONSENT_REQUIRED_REGIONS = new Set(["EU", "CA"]);

export interface GuardContact {
  email: string;
  region: string;
  consentStatus: string; // none | implied | express
}

export interface GuardContext {
  postalAddress: string;
  fromEmail: string;
  fromName: string;
}

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// The single decision point for "may we send to this contact?".
// Called for every recipient before a message is handed to the ESP.
export async function checkSendAllowed(
  contact: GuardContact,
  ctx: GuardContext,
): Promise<GuardResult> {
  const email = contact.email.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { allowed: false, reason: "invalid-email" };
  }

  // 1) Sender identity must be complete (postal address is legally required).
  if (!ctx.postalAddress || ctx.postalAddress.trim().length < 5) {
    return { allowed: false, reason: "missing-postal-address" };
  }
  if (!isValidEmail(ctx.fromEmail)) {
    return { allowed: false, reason: "invalid-from-address" };
  }

  // 2) Suppression list: unsubscribes, bounces, complaints are permanent.
  const suppressed = await prisma.suppressionEntry.findUnique({
    where: { email },
  });
  if (suppressed) {
    return { allowed: false, reason: `suppressed:${suppressed.reason}` };
  }

  // 3) Consent gate for EU / Canada.
  if (CONSENT_REQUIRED_REGIONS.has(contact.region)) {
    const hasConsent =
      contact.consentStatus === "express" || contact.consentStatus === "implied";
    if (!hasConsent) {
      return { allowed: false, reason: `consent-required:${contact.region}` };
    }
  }

  return { allowed: true };
}

// Synchronous variant used by unit tests / UI checklist where suppression
// is checked separately. Returns the same reasons except suppression.
export function checkSendAllowedSync(
  contact: GuardContact,
  ctx: GuardContext,
): GuardResult {
  const email = contact.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { allowed: false, reason: "invalid-email" };
  if (!ctx.postalAddress || ctx.postalAddress.trim().length < 5)
    return { allowed: false, reason: "missing-postal-address" };
  if (!isValidEmail(ctx.fromEmail))
    return { allowed: false, reason: "invalid-from-address" };
  if (CONSENT_REQUIRED_REGIONS.has(contact.region)) {
    const hasConsent =
      contact.consentStatus === "express" || contact.consentStatus === "implied";
    if (!hasConsent)
      return { allowed: false, reason: `consent-required:${contact.region}` };
  }
  return { allowed: true };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function humanReason(reason: string): string {
  if (reason.startsWith("suppressed:")) {
    const r = reason.split(":")[1];
    return `On suppression list (${r})`;
  }
  if (reason.startsWith("consent-required:")) {
    const region = reason.split(":")[1];
    return `${region} recipient without recorded consent (GDPR/CASL)`;
  }
  switch (reason) {
    case "invalid-email":
      return "Invalid recipient email address";
    case "missing-postal-address":
      return "Sender postal address is required (CAN-SPAM)";
    case "invalid-from-address":
      return "Sender From address is invalid";
    default:
      return reason;
  }
}
