import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCsv, rowsToContacts } from "@/lib/csv";

// Accepts raw CSV text ({ csv: string }) and upserts contacts.
// Imported contacts default to consentStatus you supply per-row; missing
// consent stays "none" so the guard will block EU/CA sends until reviewed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const csv: string | undefined = body?.csv;
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ ok: false, error: "csv field required" }, { status: 400 });
  }

  const { contacts, skipped } = rowsToContacts(parseCsv(csv));
  let imported = 0;

  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    await prisma.contact.upsert({
      where: { email },
      create: {
        email,
        name: c.name || null,
        company: c.company || null,
        region: c.region || "unknown",
        consentStatus: c.consentStatus || "none",
        tags: c.tags || "",
        source: "csv",
      },
      update: {
        name: c.name || undefined,
        company: c.company || undefined,
        region: c.region || undefined,
        consentStatus: c.consentStatus || undefined,
        tags: c.tags || undefined,
      },
    });
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
