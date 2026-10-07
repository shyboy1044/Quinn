import { NextRequest, NextResponse } from "next/server";
import { parseCsv, rowsToContacts, type ContactRowsResult } from "@/lib/csv";
import { readXlsxSheets, XlsxError } from "@/lib/xlsx";
import { saveImportedContacts } from "@/lib/contacts-import";

// The .xlsx reader unzips with node:zlib.
export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SAMPLE_SIZE = 10;

// Accepts multipart form data with a `file` (.xlsx or .csv). With
// mode=preview it reports what it found without saving anything; otherwise
// it upserts the contacts like the CSV text import does.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ ok: false, error: "file field required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "The file is larger than 10 MB." }, { status: 413 });
  }

  let parsed: ParsedFile;
  try {
    parsed = parseContactsFile(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof XlsxError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 422 });
    }
    throw e;
  }

  const { contacts, skipped, duplicates, columns } = parsed.result;
  if (!columns) {
    return NextResponse.json(
      { ok: false, error: "No email addresses were found in this file." },
      { status: 422 },
    );
  }

  if (form?.get("mode") === "preview") {
    return NextResponse.json({
      ok: true,
      sheet: parsed.sheet,
      columns,
      found: contacts.length,
      skipped,
      duplicates,
      sample: contacts.slice(0, SAMPLE_SIZE),
    });
  }

  const imported = await saveImportedContacts(contacts, parsed.format);
  return NextResponse.json({ ok: true, imported, skipped, duplicates });
}

interface ParsedFile {
  format: "csv" | "xlsx";
  sheet: string | null;
  result: ContactRowsResult;
}

function parseContactsFile(bytes: Uint8Array): ParsedFile {
  // Workbooks are zips ("PK") or, for legacy/encrypted ones, OLE files that
  // readXlsxSheets rejects with a helpful message. Anything else is CSV text.
  const isWorkbook =
    (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  if (!isWorkbook) {
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    return { format: "csv", sheet: null, result: rowsToContacts(parseCsv(text)) };
  }

  // Use the first sheet, in tab order, that has a column of email addresses.
  const sheets = readXlsxSheets(bytes);
  for (const s of sheets) {
    const result = rowsToContacts(s.rows);
    if (result.columns) return { format: "xlsx", sheet: s.name, result };
  }
  return { format: "xlsx", sheet: null, result: rowsToContacts([]) };
}
