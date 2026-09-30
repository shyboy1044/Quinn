import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Import selected GitHub leads (that have a public email) into Contacts.
// Imported contacts default to region="unknown" and consentStatus="none",
// so the compliance guard will require review before any EU/CA send.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ ok: false, error: "leadIds required" }, { status: 400 });
  }

  const leads = await prisma.githubLead.findMany({ where: { id: { in: leadIds } } });
  let imported = 0;
  let skippedNoEmail = 0;

  for (const lead of leads) {
    if (!lead.publicEmail) {
      skippedNoEmail++;
      continue;
    }
    const email = lead.publicEmail.trim().toLowerCase();
    await prisma.contact.upsert({
      where: { email },
      create: {
        email,
        name: lead.name,
        company: lead.company,
        region: "unknown",
        consentStatus: "none",
        source: "github",
        tags: "github",
      },
      update: { name: lead.name ?? undefined, company: lead.company ?? undefined },
    });
    await prisma.githubLead.update({ where: { id: lead.id }, data: { imported: true } });
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skippedNoEmail });
}
