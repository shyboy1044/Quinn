import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processCampaign } from "@/lib/email/worker";

// Enqueue recipients for a campaign and process the queue (throttled).
//
// Body (optional):
//   { contactIds?: string[] }  -> only these contacts; otherwise ALL contacts
//
// Recipients are enqueued as Send rows (idempotent via unique campaign+contact),
// then the worker runs the compliance guard + throttle and sends what it can.
// Anything over today's mailbox budget stays queued for the next run.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const contactIds: string[] | undefined = Array.isArray(body?.contactIds)
    ? body.contactIds
    : undefined;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const contacts = await prisma.contact.findMany({
    where: contactIds ? { id: { in: contactIds } } : {},
    select: { id: true, email: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ ok: false, error: "no contacts to enqueue" }, { status: 400 });
  }

  // Enqueue (skip duplicates already queued/sent for this campaign).
  for (const c of contacts) {
    await prisma.send.upsert({
      where: { campaignId_contactId: { campaignId: id, contactId: c.id } },
      create: { campaignId: id, contactId: c.id, email: c.email.toLowerCase(), status: "queued" },
      update: {}, // don't re-queue an already-processed recipient
    });
  }

  await prisma.campaign.update({ where: { id }, data: { status: "sending" } });

  const result = await processCampaign(id);
  return NextResponse.json({ ok: true, result });
}
