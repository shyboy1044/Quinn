"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";

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
          <h2 className="font-semibold text-gray-900">Import CSV</h2>
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
