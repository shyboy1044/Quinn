// Minimal CSV parser (no dependency) supporting quoted fields, commas and
// escaped quotes inside quotes. Good enough for contact list imports.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface ParsedContactRow {
  email: string;
  name?: string;
  company?: string;
  region?: string;
  consentStatus?: string;
  tags?: string;
}

// Maps CSV header names (case-insensitive) to contact fields.
export function rowsToContacts(rows: string[][]): { contacts: ParsedContactRow[]; skipped: number } {
  if (rows.length === 0) return { contacts: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));

  const iEmail = idx(["email", "email address", "e-mail"]);
  const iName = idx(["name", "full name", "contact"]);
  const iCompany = idx(["company", "organization", "organisation"]);
  const iRegion = idx(["region", "country"]);
  const iConsent = idx(["consent", "consentstatus", "consent status"]);
  const iTags = idx(["tags", "tag"]);

  const contacts: ParsedContactRow[] = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const email = iEmail >= 0 ? (cells[iEmail] ?? "").trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped++;
      continue;
    }
    contacts.push({
      email,
      name: iName >= 0 ? cells[iName]?.trim() : undefined,
      company: iCompany >= 0 ? cells[iCompany]?.trim() : undefined,
      region: iRegion >= 0 ? normalizeRegion(cells[iRegion]) : undefined,
      consentStatus: iConsent >= 0 ? normalizeConsent(cells[iConsent]) : undefined,
      tags: iTags >= 0 ? cells[iTags]?.trim() : undefined,
    });
  }
  return { contacts, skipped };
}

function normalizeRegion(v?: string): string {
  const s = (v ?? "").trim().toUpperCase();
  if (["EU", "EEA"].includes(s)) return "EU";
  if (["CA", "CANADA"].includes(s)) return "CA";
  if (["US", "USA", "UNITED STATES"].includes(s)) return "US";
  if (s === "") return "unknown";
  return "other";
}

function normalizeConsent(v?: string): string {
  const s = (v ?? "").trim().toLowerCase();
  if (["express", "explicit", "opt-in", "optin"].includes(s)) return "express";
  if (["implied", "business"].includes(s)) return "implied";
  return "none";
}
