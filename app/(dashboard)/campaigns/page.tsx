"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/client";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  fromEmail: string;
  createdAt: string;
  _count: { sends: number };
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-green-100 text-green-700",
  paused: "bg-red-100 text-red-700",
};

const SAMPLE_BODY = `<p>Hi {{name}},</p>
<p>I came across {{company}} and wanted to reach out about ...</p>
<p>Best,<br/>Your Name</p>`;

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    bodyHtml: SAMPLE_BODY,
    fromName: "",
    fromEmail: "",
    replyTo: "",
  });
  const [msg, setMsg] = useState("");

  async function load() {
    const data = await apiGet<{ campaigns: Campaign[] }>("/api/campaigns");
    setCampaigns(data.campaigns);
  }
  useEffect(() => {
    load();
    // Prefill from/reply-to from resolved identity.
    apiGet<{ resolved: { fromName: string; fromEmail: string; replyTo?: string } }>("/api/identity").then(
      (d) =>
        setForm((f) => ({
          ...f,
          fromName: f.fromName || d.resolved.fromName,
          fromEmail: f.fromEmail || d.resolved.fromEmail,
          replyTo: f.replyTo || d.resolved.replyTo || "",
        })),
    );
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, replyTo: form.replyTo || undefined };
    const res = await apiSend<{ ok: boolean; campaign?: Campaign }>("/api/campaigns", "POST", payload);
    if (res.ok) {
      setShowForm(false);
      setForm({ ...form, name: "", subject: "" });
      load();
    } else {
      setMsg("Failed — check required fields and email addresses.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">Compose, preview compliance, then send.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New campaign"}
        </button>
      </div>

      {msg && <div className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</div>}

      {showForm && (
        <form onSubmit={create} className="card mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Campaign name *</label>
              <input className="input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Subject *</label>
              <input className="input" required value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Quick question about {{company}}" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">From name *</label>
              <input className="input" required value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
            </div>
            <div>
              <label className="label">From email *</label>
              <input className="input" required type="email" value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
            </div>
            <div>
              <label className="label">Reply-to</label>
              <input className="input" type="email" value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Body (HTML, supports {"{{name}}"} / {"{{company}}"})</label>
            <textarea className="input font-mono text-xs h-40" value={form.bodyHtml}
              onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} />
            <p className="mt-1 text-xs text-gray-400">
              The unsubscribe link + postal address footer is added automatically.
            </p>
          </div>
          <button className="btn-primary" type="submit">Create campaign</button>
        </form>
      )}

      <div className="card mt-6 p-0 overflow-hidden">
        {campaigns.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">No campaigns yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Subject</th>
                <th className="th">From</th>
                <th className="th">Recipients</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="td font-medium text-gray-900">{c.name}</td>
                  <td className="td">{c.subject}</td>
                  <td className="td text-gray-500">{c.fromEmail}</td>
                  <td className="td">{c._count.sends}</td>
                  <td className="td">
                    <span className={`badge ${statusColors[c.status] || statusColors.draft}`}>{c.status}</span>
                  </td>
                  <td className="td text-right">
                    <Link href={`/campaigns/${c.id}`} className="text-brand-600 hover:underline text-sm">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
