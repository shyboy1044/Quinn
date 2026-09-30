import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { composeCompliantEmail } from "@/lib/email/render";
import { checkSendAllowedSync, humanReason } from "@/lib/compliance/guard";
import { defaultSenderIdentity } from "@/lib/compliance/identity";

// Renders a fully-composed preview (merged body + compliant footer) and a
// pre-send compliance summary: how many recipients would be blocked and why.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const identity = await defaultSenderIdentity();

  // Sample recipient for the visual preview.
  const sample = await prisma.contact.findFirst({ orderBy: { createdAt: "desc" } });
  const previewTo = sample?.email ?? "sample@example.com";
  const message = composeCompliantEmail({
    to: previewTo,
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    replyTo: campaign.replyTo ?? undefined,
    subject: campaign.subject,
    bodyHtml: campaign.bodyHtml,
    postalAddress: identity.postalAddress,
    vars: { name: sample?.name ?? "there", company: sample?.company ?? "", email: previewTo },
  });

  // Compliance checklist across all contacts (suppression checked separately).
  const contacts = await prisma.contact.findMany();
  const suppressed = new Set(
    (await prisma.suppressionEntry.findMany({ select: { email: true } })).map((s) => s.email),
  );

  const reasons: Record<string, number> = {};
  let allowed = 0;
  for (const c of contacts) {
    if (suppressed.has(c.email.toLowerCase())) {
      reasons["On suppression list"] = (reasons["On suppression list"] || 0) + 1;
      continue;
    }
    const g = checkSendAllowedSync(
      { email: c.email, region: c.region, consentStatus: c.consentStatus },
      { postalAddress: identity.postalAddress, fromEmail: campaign.fromEmail, fromName: campaign.fromName },
    );
    if (g.allowed) allowed++;
    else {
      const label = humanReason(g.reason);
      reasons[label] = (reasons[label] || 0) + 1;
    }
  }

  const checklist = {
    hasPostalAddress: identity.postalAddress.trim().length >= 5,
    dnsVerified: identity.dnsVerified,
    footerIncluded: message.html.includes("Unsubscribe"),
    listUnsubscribeHeader: Boolean(message.headers?.["List-Unsubscribe"]),
  };

  return NextResponse.json({
    ok: true,
    preview: { subject: message.subject, html: message.html, from: message.from },
    audience: { total: contacts.length, allowed, blocked: contacts.length - allowed, reasons },
    checklist,
  });
}
