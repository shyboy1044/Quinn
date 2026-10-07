import { describe, it, expect } from "vitest";
import { crc32, deflateRawSync } from "node:zlib";
import { readXlsxSheets, XlsxError } from "@/lib/xlsx";
import { normalizeRegion, parseCsv, rowsToContacts } from "@/lib/csv";

// Builds a zip in memory with the same layout Excel writes.
function zip(files: Record<string, string | Buffer>, { deflate = true } = {}): Buffer {
  const out: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const body = deflate ? deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const nameBuf = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);

    out.push(local, nameBuf, body);
    central.push(entry, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...out, dir, end]);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const REL_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// A typical CRM "clients export": a summary tab first, then a title row,
// a header with split first/last names and a decoy "Email Opt-In" column.
const excelExport = () =>
  zip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS} ${REL_NS}><sheets>
  <sheet name="Summary" sheetId="1" r:id="rId1"/>
  <sheet name="Clients" sheetId="2" r:id="rId2"/>
</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId3" Type=".../styles" Target="styles.xml"/>
  <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type=".../worksheet" Target="/xl/worksheets/sheet2.xml"/>
</Relationships>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="UTF-8"?>
<sst ${NS} count="14" uniqueCount="14">
  <si><t>Total clients</t></si>
  <si><t>Clients export 2026-07-28</t></si>
  <si><t>Client ID</t></si>
  <si><t>First Name</t></si>
  <si><t>Last Name</t></si>
  <si><t>Email Address</t></si>
  <si><t>Email Opt-In</t></si>
  <si><t>Company</t></si>
  <si><t>Country</t></si>
  <si><t xml:space="preserve">Jane </t></si>
  <si><r><rPr><b/></rPr><t>Zo</t></r><r><t>&#235; Smith</t></r><rPh sb="0" eb="1"><t>ゾ</t></rPh></si>
  <si><t>Acme &amp; Co</t></si>
  <si/>
  <si><t>jane@acme.com</t></si>
</sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet ${NS}><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>4</v></c></row>
</sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet ${NS}><sheetData>
  <row r="1"><c r="A1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2" s="1"/></row>
  <row r="3" spans="1:7">
    <c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>3</v></c><c r="C3" t="s"><v>4</v></c>
    <c r="D3" t="s"><v>5</v></c><c r="E3" t="s"><v>6</v></c><c r="F3" t="s"><v>7</v></c>
    <c r="G3" t="s"><v>8</v></c>
  </row>
  <row r="4">
    <c r="A4"><v>1001</v></c><c r="B4" t="s"><v>9</v></c><c r="C4" t="inlineStr"><is><t>Doe</t></is></c>
    <c r="D4" t="s"><v>13</v></c><c r="E4" t="s"><v>12</v></c><c r="F4" t="s"><v>11</v></c>
    <c r="G4" t="inlineStr"><is><t>Germany</t></is></c>
  </row>
  <row r="5">
    <c r="A5"><v>1002</v></c><c r="B5" t="s"><v>10</v></c>
    <c r="D5" t="inlineStr"><is><t>ZOE@Example.org</t></is></c>
    <c r="G5" t="inlineStr"><is><t>United States</t></is></c>
  </row>
  <row r="6"><c r="A6"><v>1003</v></c><c r="B6" t="inlineStr"><is><t>No Email</t></is></c></row>
  <row r="7">
    <c r="A7"><v>1004</v></c><c r="B7" t="inlineStr"><is><t>Ann</t></is></c>
    <c r="D7" t="str"><f>HYPERLINK("mailto:ann@lee.io")</f><v>mailto:ann@lee.io</v></c>
  </row>
  <row r="8">
    <c r="A8"><v>1005</v></c><c r="D8" t="inlineStr"><is><t>Jane@ACME.com</t></is></c>
  </row>
</sheetData></worksheet>`,
  });

describe("xlsx reader", () => {
  it("reads every sheet in tab order with shared, inline, rich and formula strings", () => {
    const sheets = readXlsxSheets(excelExport());
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Clients"]);

    const rows = sheets[1].rows;
    // The blank row 2 is dropped.
    expect(rows[0]).toEqual(["Clients export 2026-07-28"]);
    expect(rows[1]).toEqual(["Client ID", "First Name", "Last Name", "Email Address", "Email Opt-In", "Company", "Country"]);
    expect(rows[2]).toEqual(["1001", "Jane ", "Doe", "jane@acme.com", "", "Acme & Co", "Germany"]);
    // Rich-text runs are joined, phonetic hints dropped, and the gaps left
    // by omitted cells keep later cells in their columns.
    expect(rows[3]).toEqual(["1002", "Zoë Smith", "", "ZOE@Example.org", "", "", "United States"]);
    expect(rows[5][3]).toBe("mailto:ann@lee.io");
  });

  it("reads stored (uncompressed) parts and prefixed namespaces without a workbook index", () => {
    const file = zip(
      {
        "xl/worksheets/sheet1.xml": `<x:worksheet xmlns:x="${NS.slice(7, -1)}"><x:sheetData>
  <x:row><x:c t="inlineStr"><x:is><x:t>Full name</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>E-mail</x:t></x:is></x:c></x:row>
  <x:row><x:c t="inlineStr"><x:is><x:t>Tom &lt;Q&gt; Ng</x:t></x:is></x:c><x:c t="inlineStr"><x:is><x:t>tom@ng.dev</x:t></x:is></x:c></x:row>
</x:sheetData></x:worksheet>`,
      },
      { deflate: false },
    );
    const [sheet] = readXlsxSheets(file);
    expect(sheet.rows).toEqual([
      ["Full name", "E-mail"],
      ["Tom <Q> Ng", "tom@ng.dev"],
    ]);
  });

  it("explains legacy .xls / password-protected files", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(() => readXlsxSheets(ole)).toThrow(/old \.xls file or a password-protected/);
  });

  it("rejects files that are not workbooks, or are damaged", () => {
    expect(() => readXlsxSheets(Buffer.from("email,name\na@b.co,A"))).toThrow(XlsxError);
    expect(() => readXlsxSheets(excelExport().subarray(0, 200))).toThrow(XlsxError);
  });

  it("refuses a part that inflates past the size limit", () => {
    const bomb = zip({ "xl/worksheets/sheet1.xml": Buffer.alloc(65 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(() => readXlsxSheets(bomb)).toThrow(/too large/);
  });
});

describe("rowsToContacts", () => {
  it("finds emails and names in a real-world export layout", () => {
    const rows = readXlsxSheets(excelExport())[1].rows;
    const r = rowsToContacts(rows);
    expect(r.columns).toEqual({ email: "Email Address", name: "First Name + Last Name", company: "Company" });
    expect(r.contacts).toEqual([
      { email: "jane@acme.com", name: "Jane Doe", company: "Acme & Co", region: "EU", consentStatus: undefined, tags: undefined },
      { email: "ZOE@Example.org", name: "Zoë Smith", company: undefined, region: "US", consentStatus: undefined, tags: undefined },
      { email: "ann@lee.io", name: "Ann", company: undefined, region: "unknown", consentStatus: undefined, tags: undefined },
    ]);
    expect(r.skipped).toBe(1);
    expect(r.duplicates).toBe(1);
  });

  it("prefers the plainest email header over others that also hold addresses", () => {
    const r = rowsToContacts([
      ["Account Manager Email", "Name", "Email"],
      ["rep@us.com", "Jane", "jane@acme.com"],
    ]);
    expect(r.columns?.email).toBe("Email");
    expect(r.contacts[0]).toMatchObject({ email: "jane@acme.com", name: "Jane" });
  });

  it("uses a full-name column over first/last, and ignores company names", () => {
    const r = rowsToContacts([
      ["Company Name", "First", "Last", "Customer Name", "Mail"],
      ["Acme", "J", "D", "Jane Doe", "jane@acme.com"],
    ]);
    expect(r.columns).toEqual({ email: "Mail", name: "Customer Name", company: "Company Name" });
    expect(r.contacts[0]).toMatchObject({ name: "Jane Doe", company: "Acme" });
  });

  it("falls back to content when no header names an email column", () => {
    const r = rowsToContacts([
      ["Contact", "Reach at"],
      ["Jane", "jane@acme.com"],
      ["Bob", "bob@acme.com"],
    ]);
    expect(r.columns).toEqual({ email: "Reach at", name: "Contact", company: undefined });
    expect(r.contacts.map((c) => c.name)).toEqual(["Jane", "Bob"]);

    const headerless = rowsToContacts([["jane@acme.com"], ["bob@acme.com"]]);
    expect(headerless.columns).toEqual({ email: "column A", name: undefined, company: undefined });
    expect(headerless.contacts).toHaveLength(2);
  });

  it("handles prefixed headers, phone-number contact columns and placeholders", () => {
    const r = rowsToContacts([
      ["client_aid", "client_fname", "client_lname", "client_email", "client_contact",
        "client_business_name", "client_emergency_contact_name"],
      ["1", "Jane", "Doe", "jane@acme.com", "801-555-0100", "No Data", "Sam"],
      ["2", "Bob", "Lee", "bob@acme.com", "(801) 555-0101", "Lee LLC", "Kim"],
    ]);
    expect(r.columns).toEqual({
      email: "client_email",
      name: "client_fname + client_lname",
      company: "client_business_name",
    });
    expect(r.contacts).toMatchObject([
      { email: "jane@acme.com", name: "Jane Doe", company: undefined },
      { email: "bob@acme.com", name: "Bob Lee", company: "Lee LLC" },
    ]);
  });

  it('takes the name from "Name <address>" cells', () => {
    const r = rowsToContacts([["Email"], ['"Jane Doe" <jane@acme.com>'], ["o'brien@acme.ie"]]);
    expect(r.contacts).toMatchObject([
      { email: "jane@acme.com", name: "Jane Doe" },
      { email: "o'brien@acme.ie", name: undefined },
    ]);
  });

  it("reports no columns when nothing looks like an email", () => {
    const r = rowsToContacts([["Name"], ["Jane"]]);
    expect(r.columns).toBeNull();
    expect(r.contacts).toEqual([]);
  });

  it("still imports the documented CSV format", () => {
    const r = rowsToContacts(
      parseCsv("email,name,company,region,consent,tags\njane@acme.com,Jane,Acme,US,express,vip\nnot-an-email,X,,,,"),
    );
    expect(r.contacts).toEqual([
      { email: "jane@acme.com", name: "Jane", company: "Acme", region: "US", consentStatus: "express", tags: "vip" },
    ]);
    expect(r.skipped).toBe(1);
  });
});

describe("normalizeRegion", () => {
  it("keeps every EEA country behind the EU consent gate", () => {
    for (const v of ["EU", "Germany", "de", "France", "the netherlands", "Norway", "IE"]) {
      expect(normalizeRegion(v)).toBe("EU");
    }
  });

  it("maps Canada and the US, and leaves the rest as other/unknown", () => {
    expect(normalizeRegion("Canada")).toBe("CA");
    expect(normalizeRegion("United States of America")).toBe("US");
    expect(normalizeRegion("Japan")).toBe("other");
    expect(normalizeRegion("  ")).toBe("unknown");
  });
});
