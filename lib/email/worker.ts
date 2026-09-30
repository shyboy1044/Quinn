import { prisma } from "@/lib/db";
import { checkSendAllowed } from "@/lib/compliance/guard";
import { composeCompliantEmail } from "./render";
import { getEmailProvider } from "./smtp-provider";
import { remainingBudget, sendDelayMs, sleep } from "@/lib/throttle";
import { defaultSenderIdentity } from "@/lib/compliance/identity";

export interface ProcessResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  bounced: number;
  budgetRemaining: number;
  dryRun: boolean;
  details: Array<{ email: string; status: string; reason?: string }>;
}

// Process queued sends for one campaign, respecting the daily mailbox budget.
// Each recipient passes through the compliance guard before any send.
export async function processCampaign(campaignId: string): Promise<ProcessResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const identity = await defaultSenderIdentity();
  const postalAddress = identity.postalAddress;
  const provider = getEmailProvider();

  const result: ProcessResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    bounced: 0,
    budgetRemaining: 0,
    dryRun: provider.isDryRun,
    details: [],
  };

  let budget = await remainingBudget(campaign.fromEmail);

  const queued = await prisma.send.findMany({
    where: { campaignId, status: "queued" },
    include: { contact: true },
    orderBy: { queuedAt: "asc" },
  });

  for (const send of queued) {
    if (budget <= 0) break; // stop for today; overflow stays queued
    result.processed++;

    const contact = send.contact;
    const guard = await checkSendAllowed(
      { email: contact.email, region: contact.region, consentStatus: contact.consentStatus },
      { postalAddress, fromEmail: campaign.fromEmail, fromName: campaign.fromName },
    );

    if (!guard.allowed) {
      await prisma.send.update({
        where: { id: send.id },
        data: { status: "skipped", skipReason: guard.reason, updatedAt: new Date() },
      });
      result.skipped++;
      result.details.push({ email: contact.email, status: "skipped", reason: guard.reason });
      continue;
    }

    const message = composeCompliantEmail({
      to: contact.email,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      replyTo: campaign.replyTo ?? undefined,
      subject: campaign.subject,
      bodyHtml: campaign.bodyHtml,
      postalAddress,
      vars: { name: contact.name, company: contact.company, email: contact.email },
    });

    const sendResult = await provider.send(message);

    if (sendResult.ok) {
      await prisma.send.update({
        where: { id: send.id },
        data: {
          status: "sent",
          providerId: sendResult.providerId,
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      });
      result.sent++;
      budget--;
      result.details.push({ email: contact.email, status: "sent" });
    } else if (sendResult.permanentFailure) {
      // SMTP hard-rejected this recipient (e.g. mailbox doesn't exist).
      // With no delivery webhooks, we detect the bounce here and suppress
      // the address permanently, exactly as a webhook bounce would.
      const normalized = contact.email.trim().toLowerCase();
      await prisma.suppressionEntry.upsert({
        where: { email: normalized },
        create: { email: normalized, reason: "bounce", detail: sendResult.error ?? null },
        update: {},
      });
      await prisma.send.update({
        where: { id: send.id },
        data: { status: "bounced", error: sendResult.error, updatedAt: new Date() },
      });
      result.bounced++;
      result.details.push({ email: contact.email, status: "bounced", reason: sendResult.error });
    } else {
      // Transient failure (4xx, network) — leave it retryable next run.
      await prisma.send.update({
        where: { id: send.id },
        data: { status: "failed", error: sendResult.error, updatedAt: new Date() },
      });
      result.failed++;
      result.details.push({ email: contact.email, status: "failed", reason: sendResult.error });
    }

    if (sendDelayMs() > 0 && budget > 0) await sleep(sendDelayMs());
  }

  result.budgetRemaining = budget;

  // Mark campaign done if nothing remains queued.
  const stillQueued = await prisma.send.count({ where: { campaignId, status: "queued" } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: stillQueued > 0 ? "sending" : "sent" },
  });

  return result;
}
