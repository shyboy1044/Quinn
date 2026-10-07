// Minimal CSV parser (no dependency) supporting quoted fields, commas and
// escaped quotes inside quotes. Good enough for contact list imports.
// rowsToContacts below is shared with the Excel import (lib/xlsx.ts).
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

// Which header each field was read from, so the UI can show what it picked.
export interface ContactColumns {
  email: string;
  name?: string;
  company?: string;
}

export interface ContactRowsResult {
  contacts: ParsedContactRow[];
  skipped: number; // rows without a valid email address
  duplicates: number; // repeats of an address already seen; the first row wins
  columns: ContactColumns | null; // null when no column holds email addresses
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Finds the address inside cells like "mailto:a@b.com" or "Jane <a@b.com>".
const EMAIL_IN_TEXT_RE = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/;

// Headers are compared lowercased with spaces and punctuation removed, so
// "E-mail", "Email Address" and "email_address" all match. Lists are in
// priority order.
const EMAIL_HEADERS = ["email", "emailaddress", "mail", "primaryemail", "workemail", "businessemail",
  "clientemail", "contactemail", "customeremail", "emailid"];
const NAME_HEADERS = ["name", "fullname", "contactname", "clientname", "customername", "displayname",
  "contact", "client", "customer"];
const FIRST_NAME_HEADERS = ["firstname", "fname", "givenname", "forename", "first"];
const LAST_NAME_HEADERS = ["lastname", "lname", "surname", "familyname", "last"];
const COMPANY_HEADERS = ["company", "companyname", "organization", "organisation", "organizationname",
  "organisationname", "business", "businessname", "employer", "account", "accountname"];
const REGION_HEADERS = ["region", "country", "countrycode", "countryregion"];
const CONSENT_HEADERS = ["consent", "consentstatus"];
const TAG_HEADERS = ["tags", "tag"];
// A header containing "name" counts as a person's name unless it is one of these.
const NOT_A_PERSON_NAME = /company|business|organi|account|user|nick|middle|file|domain|brand|firm|employer|street|city|campaign|product|list|group|tag|emergency|representative|bank|spouse/;
// Exports often prefix every header with the record type ("client_fname"),
// so headers are matched with and without that prefix.
const ENTITY_PREFIX = /^(client|customer|contact|lead|member|person|primary)(?=[a-z])/;
// Values exports use for "no value"; treated as empty.
const PLACEHOLDER = /^(no data|n\/?a|none|null|undefined|-+|—)$/i;

// Exports often start with a title or summary rows before the header.
const HEADER_SCAN_ROWS = 20;

interface Layout {
  header: number; // -1 when the file has no header row
  email: number;
  name?: number;
  first?: number;
  last?: number;
  company?: number;
  region?: number;
  consent?: number;
  tags?: number;
}

// Finds the email (and, where present, name/company/...) columns and maps
// every row below the header to a contact.
export function rowsToContacts(rows: string[][]): ContactRowsResult {
  const layout = detectLayout(rows);
  if (!layout) return { contacts: [], skipped: rows.length, duplicates: 0, columns: null };

  const contacts: ParsedContactRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  for (let r = layout.header + 1; r < rows.length; r++) {
    const cells = rows[r];
    const cell = (i?: number) => {
      const v = i === undefined ? "" : (cells[i] ?? "").trim();
      return PLACEHOLDER.test(v) ? "" : v;
    };
    const found = extractEmail(cell(layout.email));
    if (!found) {
      skipped++;
      continue;
    }
    const key = found.email.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    const name =
      layout.name !== undefined
        ? cell(layout.name)
        : [cell(layout.first), cell(layout.last)].filter(Boolean).join(" ");
    contacts.push({
      email: found.email,
      name: name || found.displayName,
      company: cell(layout.company) || undefined,
      region: layout.region !== undefined ? normalizeRegion(cell(layout.region)) : undefined,
      consentStatus: layout.consent !== undefined ? normalizeConsent(cell(layout.consent)) : undefined,
      tags: cell(layout.tags) || undefined,
    });
  }

  return { contacts, skipped, duplicates, columns: describeColumns(rows, layout) };
}

function detectLayout(rows: string[][]): Layout | null {
  // 1) A header row that names an email column which really holds addresses.
  //    The best-named column wins; among equals, the one with most addresses.
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const header = rows[r].map(normHeader);
    let best = -1;
    let bestRank = Infinity;
    let bestCount = 0;
    header.forEach((h, i) => {
      const exact = [h, stripPrefix(h)].map((v) => EMAIL_HEADERS.indexOf(v)).filter((i) => i >= 0);
      const rank = exact.length ? Math.min(...exact) : h.includes("email") ? EMAIL_HEADERS.length : -1;
      // An address like "emailme@x.com" is data, not a header.
      if (rank < 0 || extractEmail(rows[r][i])) return;
      const count = countEmails(rows, r + 1, i);
      if (count > 0 && (rank < bestRank || (rank === bestRank && count > bestCount))) {
        best = i;
        bestRank = rank;
        bestCount = count;
      }
    });
    if (best >= 0) return { header: r, email: best, ...namedColumns(rows, r, best) };
  }

  // 2) No usable header: take the column holding the most addresses, and the
  //    row just above its first address as the header if it holds none itself.
  let best = -1;
  let bestCount = 0;
  const width = rows.reduce((w, row) => Math.max(w, row.length), 0);
  for (let c = 0; c < width; c++) {
    const count = countEmails(rows, 0, c);
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  if (best < 0) return null;
  const first = rows.findIndex((row) => extractEmail(row[best]) !== null);
  const header = first > 0 && !rows[first - 1].some((c) => extractEmail(c)) ? first - 1 : -1;
  return {
    header,
    email: best,
    ...(header >= 0 ? namedColumns(rows, header, best) : {}),
  };
}

function namedColumns(rows: string[][], headerRow: number, emailCol: number): Omit<Layout, "header" | "email"> {
  const header = rows[headerRow].map(normHeader);
  // Name columns must hold words, so a "client_contact" column of phone
  // numbers is not taken for a name.
  const ok = (j: number, names: boolean) => j !== emailCol && (!names || holdsNames(rows, headerRow + 1, j));
  const find = (list: string[], names = false) => {
    for (const n of list) {
      const i = header.findIndex((h, j) => (h === n || stripPrefix(h) === n) && ok(j, names));
      if (i >= 0) return i;
    }
    return undefined;
  };
  const findWhere = (test: (h: string) => boolean, names = false) => {
    const i = header.findIndex((h, j) => test(h) && ok(j, names));
    return i >= 0 ? i : undefined;
  };

  let name = find(NAME_HEADERS, true);
  const first = name === undefined ? find(FIRST_NAME_HEADERS, true) : undefined;
  const last = name === undefined ? find(LAST_NAME_HEADERS, true) : undefined;
  if (name === undefined && first === undefined && last === undefined) {
    name = findWhere((h) => h.includes("name") && !NOT_A_PERSON_NAME.test(h), true);
  }

  return {
    name,
    first,
    last,
    company: find(COMPANY_HEADERS) ?? findWhere((h) => h.includes("company")),
    region: find(REGION_HEADERS),
    consent: find(CONSENT_HEADERS),
    tags: find(TAG_HEADERS),
  };
}

function describeColumns(rows: string[][], layout: Layout): ContactColumns {
  const label = (i: number) =>
    (layout.header >= 0 ? rows[layout.header][i]?.trim() : "") || `column ${columnLetter(i)}`;
  const nameParts = [layout.name, layout.first, layout.last].filter((i): i is number => i !== undefined);
  return {
    email: label(layout.email),
    name: nameParts.length ? nameParts.map(label).join(" + ") : undefined,
    company: layout.company !== undefined ? label(layout.company) : undefined,
  };
}

function extractEmail(text = ""): { email: string; displayName?: string } | null {
  const m = text.match(EMAIL_IN_TEXT_RE);
  if (!m) return null;
  const email = m[0].replace(/^'+|['.]+$/g, "");
  if (!EMAIL_RE.test(email)) return null;
  // "Jane Doe <jane@acme.com>" carries a display name.
  const display = text.match(/^\s*"?([^"<>@]*?)"?\s*<[^<>]+>\s*$/)?.[1].trim();
  return { email, displayName: display || undefined };
}

function countEmails(rows: string[][], from: number, col: number): number {
  let n = 0;
  for (let r = from; r < rows.length; r++) if (extractEmail(rows[r][col])) n++;
  return n;
}

// True when most filled cells (of the first 200) contain letters and no "@".
function holdsNames(rows: string[][], from: number, col: number): boolean {
  let filled = 0;
  let wordy = 0;
  for (let r = from; r < rows.length && filled < 200; r++) {
    const v = (rows[r][col] ?? "").trim();
    if (!v || PLACEHOLDER.test(v)) continue;
    filled++;
    if (/\p{L}/u.test(v) && !v.includes("@")) wordy++;
  }
  return wordy >= filled * 0.8;
}

function stripPrefix(h: string): string {
  return h.replace(ENTITY_PREFIX, "");
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// GDPR covers the whole EEA (EU + Iceland, Liechtenstein, Norway), so every
// EEA country maps to "EU" and stays behind the consent gate.
const EU_REGION = new Set([
  "EU", "EEA", "EUROPEAN UNION",
  "AT", "AUSTRIA", "BE", "BELGIUM", "BG", "BULGARIA", "HR", "CROATIA", "CY", "CYPRUS",
  "CZ", "CZECHIA", "CZECH REPUBLIC", "DK", "DENMARK", "EE", "ESTONIA", "FI", "FINLAND",
  "FR", "FRANCE", "DE", "GERMANY", "GR", "EL", "GREECE", "HU", "HUNGARY", "IE", "IRELAND",
  "IT", "ITALY", "LV", "LATVIA", "LT", "LITHUANIA", "LU", "LUXEMBOURG", "MT", "MALTA",
  "NL", "NETHERLANDS", "THE NETHERLANDS", "PL", "POLAND", "PT", "PORTUGAL", "RO", "ROMANIA",
  "SK", "SLOVAKIA", "SI", "SLOVENIA", "ES", "SPAIN", "SE", "SWEDEN",
  "IS", "ICELAND", "LI", "LIECHTENSTEIN", "NO", "NORWAY",
]);
const CA_REGION = new Set(["CA", "CAN", "CANADA"]);
const US_REGION = new Set(["US", "USA", "U.S.", "U.S.A.", "UNITED STATES", "UNITED STATES OF AMERICA"]);

export function normalizeRegion(v?: string): string {
  const s = (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (EU_REGION.has(s)) return "EU";
  if (CA_REGION.has(s)) return "CA";
  if (US_REGION.has(s)) return "US";
  if (s === "") return "unknown";
  return "other";
}

function normalizeConsent(v?: string): string {
  const s = (v ?? "").trim().toLowerCase();
  if (["express", "explicit", "opt-in", "optin"].includes(s)) return "express";
  if (["implied", "business"].includes(s)) return "implied";
  return "none";
}
