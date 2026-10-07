import { NextRequest, NextResponse } from "next/server";
import { parseCsv, rowsToContacts } from "@/lib/csv";
import { saveImportedContacts } from "@/lib/contacts-import";

// Accepts raw CSV text ({ csv: string }) and upserts contacts.
// Imported contacts default to consentStatus you supply per-row; missing
// consent stays "none" so the guard will block EU/CA sends until reviewed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const csv: string | undefined = body?.csv;
  if (!csv || typeof csv !== "string") {
    return NextResponse.json({ ok: false, error: "csv field required" }, { status: 400 });
  }

  const { contacts, skipped, duplicates } = rowsToContacts(parseCsv(csv));
  const imported = await saveImportedContacts(contacts, "csv");

  return NextResponse.json({ ok: true, imported, skipped, duplicates });
}
