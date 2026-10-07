import { inflateRawSync } from "node:zlib";

// Minimal .xlsx reader (no dependency). An .xlsx file is a zip of XML parts;
// this unzips it with node:zlib and returns every worksheet as rows of cell
// text, which is all a contact import needs. Formulas yield their cached
// value; styles, dates and number formats are ignored.

export class XlsxError extends Error {}

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

// Zip-bomb guard: no single XML part may inflate beyond this.
const MAX_PART_BYTES = 64 * 1024 * 1024;
// Excel's own column limit (XFD); anything beyond is a malformed reference.
const MAX_COLUMNS = 16384;

export function readXlsxSheets(data: Uint8Array): XlsxSheet[] {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    // OLE compound file: legacy .xls, or an .xlsx protected with a password.
    throw new XlsxError(
      "This is an old .xls file or a password-protected workbook. Open it in Excel and save it as .xlsx without a password.",
    );
  }
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new XlsxError("This file is not an .xlsx workbook.");
  }

  const parts = readZip(buf);
  const shared = parts.has("xl/sharedstrings.xml")
    ? parseSharedStrings(parts.text("xl/sharedstrings.xml"))
    : [];

  return listSheets(parts).map(({ name, path }) => ({
    name,
    rows: parts.has(path) ? parseSheet(parts.text(path), shared) : [],
  }));
}

// ---------------------------------------------------------------- zip

interface ZipParts {
  has(path: string): boolean;
  text(path: string): string;
  paths(): string[];
}

function readZip(buf: Buffer): ZipParts {
  // The end-of-central-directory record sits in the last 22 bytes plus an
  // optional comment of up to 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("The workbook is damaged (zip directory not found).");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new XlsxError("Workbooks larger than 4 GB are not supported.");

  const entries = new Map<string, { method: number; offset: number; size: number }>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new XlsxError("The workbook is damaged (bad zip entry).");
    }
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // OPC part names are case-insensitive.
    entries.set(name.replace(/\\/g, "/").replace(/^\//, "").toLowerCase(), { method, offset, size });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const read = (path: string): Buffer => {
    const e = entries.get(path);
    if (!e) throw new XlsxError(`The workbook is missing ${path}.`);
    if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) {
      throw new XlsxError("The workbook is damaged (bad zip header).");
    }
    // Sizes come from the central directory: local headers may defer them
    // to a trailing data descriptor.
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const raw = buf.subarray(start, start + e.size);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new XlsxError("The workbook uses an unsupported compression method.");
    try {
      return inflateRawSync(raw, { maxOutputLength: MAX_PART_BYTES });
    } catch {
      throw new XlsxError("The workbook is damaged or too large to read.");
    }
  };

  return {
    has: (path) => entries.has(path),
    text: (path) => read(path).toString("utf8"),
    paths: () => [...entries.keys()],
  };
}

// ---------------------------------------------------------------- workbook

// Worksheets in workbook (tab) order, resolved through workbook.xml.rels.
function listSheets(parts: ZipParts): { name: string; path: string }[] {
  const rels = new Map<string, string>();
  if (parts.has("xl/_rels/workbook.xml.rels")) {
    for (const m of parts.text("xl/_rels/workbook.xml.rels").matchAll(tagRe("Relationship"))) {
      const a = attrs(m[1]);
      const id = attr(a, "Id");
      const target = attr(a, "Target");
      if (id && target) rels.set(id, resolveTarget(target));
    }
  }

  const sheets: { name: string; path: string }[] = [];
  if (parts.has("xl/workbook.xml")) {
    for (const m of parts.text("xl/workbook.xml").matchAll(tagRe("sheet"))) {
      const a = attrs(m[1]);
      const path = rels.get(attr(a, "id") ?? "");
      if (path) sheets.push({ name: attr(a, "name") ?? path, path });
    }
  }
  if (sheets.length > 0) return sheets;

  // No usable workbook index: fall back to the worksheet parts themselves.
  return parts
    .paths()
    .filter((p) => /^xl\/worksheets\/[^/]+\.xml$/.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((path) => ({ name: path.replace(/^.*\/|\.xml$/g, ""), path }));
}

function resolveTarget(target: string): string {
  const t = target.replace(/\\/g, "/");
  const path = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/").toLowerCase();
}

// ---------------------------------------------------------------- cells

function parseSharedStrings(xml: string): string[] {
  // <si/> entries must keep their index even when empty.
  return [...xml.matchAll(elementRe("si"))].map((m) => richText(m[2] ?? ""));
}

// Concatenates the <t> runs of a string item, skipping phonetic hints.
function richText(xml: string): string {
  const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let text = "";
  for (const m of body.matchAll(elementRe("t"))) text += decodeXml(m[2] ?? "");
  return text;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(elementRe("row"))) {
    const row: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(elementRe("c"))) {
      const a = attrs(cellMatch[1]);
      const ref = attr(a, "r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      if (col < 0 || col >= MAX_COLUMNS) continue;

      const inner = cellMatch[2] ?? "";
      const type = attr(a, "t");
      let value: string;
      if (type === "inlineStr") {
        const is = inner.match(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/);
        value = richText(is?.[1] ?? "");
      } else {
        const v = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
        const raw = v ? decodeXml(v[1]) : "";
        value = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      while (row.length < col) row.push("");
      row[col] = value;
    }
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

// "B12" -> 1, "AA3" -> 26
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Za-z]+/)?.[0];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---------------------------------------------------------------- xml helpers

// Matches an element that is either self-closing or has a body; group 1 is
// its attributes and group 2 its body. Tolerates namespace prefixes (x:row).
function elementRe(name: string): RegExp {
  return new RegExp(
    `<(?:\\w+:)?${name}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>)`,
    "g",
  );
}

// Matches just the opening tag; group 1 is its attributes.
function tagRe(name: string): RegExp {
  return new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)\\/?>`, "g");
}

function attrs(s: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out.set(m[1], decodeXml(m[3] ?? m[4] ?? ""));
  }
  return out;
}

// Looks an attribute up by local name, so r:id and id both match "id".
function attr(a: Map<string, string>, local: string): string | undefined {
  for (const [k, v] of a) if (k === local || k.endsWith(`:${local}`)) return v;
  return undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e as "lt"];
    })
    // Excel escapes control characters in strings as _xHHHH_.
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}
