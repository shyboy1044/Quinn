import { prisma } from "@/lib/db";
import type { ParsedContactRow } from "@/lib/csv";

// Upserts imported rows by email. Missing consent stays "none" so the guard
// blocks EU/CA sends until reviewed; existing contacts only gain the fields
// the file actually provides.
export async function saveImportedContacts(
  contacts: ParsedContactRow[],
  source: "csv" | "xlsx",
): Promise<number> {
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
        source,
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
  return imported;
}
