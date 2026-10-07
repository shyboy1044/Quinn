"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend, apiUpload } from "@/lib/client";

interface Contact {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  region: string;
  consentStatus: string;
  source: string;
  tags: string;
}

interface FilePreview {
  sheet: string | null;
  columns: { email: string; name?: string; company?: string };
  found: number;
  skipped: number;
  duplicates: number;
  sample: { email: string; name?: string; company?: string }[];
}

type FileResult =
  | ({ ok: true; imported: number } & FilePreview)
  | { ok: false; error?: string };

const regionColors: Record<string, string> = {
  EU: "bg-purple-100 text-purple-700",
  CA: "bg-red-100 text-red-700",
  US: "bg-green-100 text-green-700",
  unknown: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-600",
};
const consentColors: Record<string, string> = {
  express: "bg-green-100 text-green-700",
  implied: "bg-amber-100 text-amber-700",
  none: "bg-gray-100 text-gray-600",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: "", name: "", company: "", region: "unknown", consentStatus: "none" });
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const data = await apiGet<{ contacts: Contact[] }>("/api/contacts");
    setContacts(data.contacts);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await apiSend<{ ok: boolean }>("/api/contacts", "POST", form);
    if (res.ok) {
      setForm({ email: "", name: "", company: "", region: "unknown", consentStatus: "none" });
      setMsg("Contact saved.");
      load();
    } else {
      setMsg("Failed to save — check the email address.");
    }
  }

  async function importCsv() {
    setError("");
    const res = await apiSend<{ ok: boolean; imported: number; skipped: number }>(
      "/api/contacts/import",
      "POST",
      { csv },
    );
    if (res.ok) {
      setMsg(`Imported ${res.imported} contacts (${res.skipped} skipped).`);
      setCsv("");
      load();
    }
  }

  // Sends the chosen .xlsx/.csv file; "preview" only reports what was found.
  async function sendFile(f: File, mode: "preview" | "import"): Promise<FileResult> {
    const form = new FormData();
    form.append("file", f);
    form.append("mode", mode);
    setBusy(true);
    try {
      return await apiUpload<FileResult>("/api/contacts/import/file", form);
    } catch {
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  async function previewFile(f: File | undefined) {
    setMsg("");
    setError("");
    setPreview(null);
    setFile(f ?? null);
    if (!f) return;
    const res = await sendFile(f, "preview");
    if (res.ok) setPreview(res);
    else setError(res.error || "Could not read this file.");
  }

  async function importFile() {
    if (!file) return;
    const res = await sendFile(file, "import");
    if (res.ok) {
      const notes = [
        res.skipped > 0 && `${res.skipped} rows without an email`,
        res.duplicates > 0 && `${res.duplicates} duplicates`,
      ].filter(Boolean);
      setMsg(`Imported ${res.imported} contacts${notes.length ? ` (skipped ${notes.join(", ")})` : ""}.`);
      clearFile();
      load();
    } else {
      setError(res.error || "Import failed.");
    }
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function del(id: string) {
    await apiSend(`/api/contacts/${id}`, "DELETE");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tag region + consent accurately — EU/Canada recipients need recorded
        consent (GDPR/CASL) or the send is blocked.
      </p>

      {msg && <div className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}
      {error && <div className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <form onSubmit={addContact} className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Add a contact</h2>
          <div>
            <label className="label">Email *</label>
            <input className="input" required type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Company</label>
              <input className="input" value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Region</label>
              <select className="input" value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="US">US</option>
                <option value="EU">EU</option>
                <option value="CA">Canada</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Consent</label>
              <select className="input" value={form.consentStatus}
                onChange={(e) => setForm({ ...form, consentStatus: e.target.value })}>
                <option value="none">None</option>
                <option value="implied">Implied (business relationship)</option>
                <option value="express">Express (opted in)</option>
              </select>
            </div>
          </div>
          <button className="btn-primary w-full" type="submit">Save contact</button>
        </form>

        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Import from Excel or CSV</h2>
          <p className="text-xs text-gray-500">
            Upload an <code>.xlsx</code> or <code>.csv</code> export. The email and name
            columns are found from the headers, and you see a preview before anything is saved.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.csv"
            disabled={busy}
            onChange={(e) => previewFile(e.target.files?.[0])}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
          />
          {busy && <p className="text-xs text-gray-400">Reading file…</p>}

          {preview && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {preview.sheet && (
                  <>
                    <dt className="text-gray-500">Sheet</dt>
                    <dd className="text-gray-900">{preview.sheet}</dd>
                  </>
                )}
                <dt className="text-gray-500">Email column</dt>
                <dd className="text-gray-900">{preview.columns.email}</dd>
                <dt className="text-gray-500">Name column</dt>
                <dd className="text-gray-900">{preview.columns.name ?? "not found"}</dd>
                {preview.columns.company && (
                  <>
                    <dt className="text-gray-500">Company column</dt>
                    <dd className="text-gray-900">{preview.columns.company}</dd>
                  </>
                )}
              </dl>
              <p className="text-sm text-gray-700">
                <strong>{preview.found}</strong> contacts found
                {preview.skipped > 0 && ` · ${preview.skipped} rows without an email`}
                {preview.duplicates > 0 && ` · ${preview.duplicates} duplicates`}
              </p>
              <div className="max-h-56 overflow-auto rounded-md border border-gray-100">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="th">Email</th>
                      <th className="th">Name</th>
                      {preview.columns.company && <th className="th">Company</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.sample.map((c) => (
                      <tr key={c.email}>
                        <td className="td">{c.email}</td>
                        <td className="td">{c.name || "—"}</td>
                        {preview.columns.company && <td className="td">{c.company || "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.found > preview.sample.length && (
                <p className="text-xs text-gray-400">Showing the first {preview.sample.length}.</p>
              )}
              <p className="text-xs text-gray-500">
                Consent is recorded as <code>none</code> unless the file has a consent column.
              </p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={importFile} disabled={busy}>
                  Import {preview.found} contacts
                </button>
                <button className="btn-secondary" onClick={clearFile} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">Or paste CSV text</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">
                Headers: <code>email, name, company, region, consent, tags</code>.
                Only <code>email</code> is required.
              </p>
              <textarea
                className="input font-mono text-xs h-36"
                placeholder={"email,name,company,region,consent\njane@acme.com,Jane,Acme,US,express"}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
              />
              <button className="btn-secondary w-full" onClick={importCsv} disabled={!csv.trim()}>
                Import
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">All contacts ({contacts.length})</h2>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : contacts.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">No contacts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="th">Email</th>
                  <th className="th">Name</th>
                  <th className="th">Company</th>
                  <th className="th">Region</th>
                  <th className="th">Consent</th>
                  <th className="th">Source</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="td font-medium text-gray-900">{c.email}</td>
                    <td className="td">{c.name || "—"}</td>
                    <td className="td">{c.company || "—"}</td>
                    <td className="td">
                      <span className={`badge ${regionColors[c.region] || regionColors.other}`}>{c.region}</span>
                    </td>
                    <td className="td">
                      <span className={`badge ${consentColors[c.consentStatus] || consentColors.none}`}>{c.consentStatus}</span>
                    </td>
                    <td className="td text-gray-400">{c.source}</td>
                    <td className="td text-right">
                      <button className="text-red-600 hover:underline text-xs" onClick={() => del(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
