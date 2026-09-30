"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";

interface Identity {
  id: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  postalAddress: string;
  domain: string | null;
  dnsVerified: boolean;
  isDefault: boolean;
}

interface SmtpStatus {
  configured: boolean;
  ok: boolean;
  host: string | null;
  port: string;
  user: string | null;
  error?: string;
  dryRun?: boolean;
}

export default function SettingsPage() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [form, setForm] = useState({
    fromName: "",
    fromEmail: "",
    replyTo: "",
    postalAddress: "",
    domain: "",
  });
  const [msg, setMsg] = useState("");
  const [smtp, setSmtp] = useState<SmtpStatus | null>(null);
  const [testing, setTesting] = useState(false);

  async function load() {
    const data = await apiGet<{ identities: Identity[]; resolved: Identity }>("/api/identity");
    setIdentities(data.identities);
    if (data.resolved) {
      setForm((f) => ({
        fromName: f.fromName || data.resolved.fromName,
        fromEmail: f.fromEmail || data.resolved.fromEmail,
        replyTo: f.replyTo || data.resolved.replyTo || "",
        postalAddress: f.postalAddress || data.resolved.postalAddress,
        domain: f.domain || data.resolved.domain || "",
      }));
    }
  }

  async function testSmtp() {
    setTesting(true);
    const s = await apiGet<SmtpStatus>("/api/smtp/test");
    setSmtp(s);
    setTesting(false);
  }

  useEffect(() => {
    load();
    testSmtp();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiSend<{ ok: boolean }>("/api/identity", "POST", {
      ...form,
      replyTo: form.replyTo || undefined,
      domain: form.domain || undefined,
      isDefault: true,
    });
    setMsg(res.ok ? "Sender identity saved as default." : "Save failed — check the fields.");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Sender identity and deliverability setup.</p>

      {msg && <div className="mt-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      <form onSubmit={save} className="card mt-6 space-y-3">
        <h2 className="font-semibold text-gray-900">Sender identity</h2>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Reply-to</label>
            <input className="input" type="email" value={form.replyTo}
              onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
          </div>
          <div>
            <label className="label">Sending domain</label>
            <input className="input" placeholder="yourdomain.com" value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Physical postal address * (required by CAN-SPAM)</label>
          <input className="input" required value={form.postalAddress}
            onChange={(e) => setForm({ ...form, postalAddress: e.target.value })}
            placeholder="123 Example St, Suite 100, City, ST 00000, Country" />
        </div>
        <button className="btn-primary" type="submit">Save as default identity</button>
      </form>

      <div className="card mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">SMTP connection</h2>
          <button className="btn-secondary text-xs" onClick={testSmtp} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        {smtp && (
          <div className="mt-3">
            {!smtp.configured ? (
              <div className="rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
                <strong>Not configured (dry-run).</strong> Set SMTP_HOST / SMTP_USER
                / SMTP_PASS in <code className="rounded bg-blue-100 px-1">.env</code> and restart.
              </div>
            ) : smtp.ok ? (
              <div className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
                <strong>Connected.</strong> {smtp.user} via {smtp.host}:{smtp.port}
              </div>
            ) : (
              <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
                <strong>Connection failed:</strong> {smtp.error}
              </div>
            )}
          </div>
        )}

        <h3 className="mt-5 font-medium text-gray-900 text-sm">Gmail setup</h3>
        <ol className="mt-2 space-y-1 text-sm text-gray-600 list-decimal list-inside">
          <li>Turn on 2-Step Verification on your Google account.</li>
          <li>Create an <strong>App Password</strong> (Google Account → Security → App passwords).</li>
          <li>In <code className="rounded bg-gray-100 px-1">.env</code>: <code className="rounded bg-gray-100 px-1">SMTP_HOST=smtp.gmail.com</code>, <code className="rounded bg-gray-100 px-1">SMTP_PORT=587</code>, <code className="rounded bg-gray-100 px-1">SMTP_USER</code>=your address, <code className="rounded bg-gray-100 px-1">SMTP_PASS</code>=the App Password.</li>
        </ol>

        <h3 className="mt-4 font-medium text-gray-900 text-sm">Outlook.com setup</h3>
        <ol className="mt-2 space-y-1 text-sm text-gray-600 list-decimal list-inside">
          <li>Enable 2-Step Verification and create an App Password (Microsoft account → Security).</li>
          <li>In <code className="rounded bg-gray-100 px-1">.env</code>: <code className="rounded bg-gray-100 px-1">SMTP_HOST=smtp-mail.outlook.com</code>, <code className="rounded bg-gray-100 px-1">SMTP_PORT=587</code>, then your address + App Password.</li>
        </ol>

        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-100">
          <strong>Heads up:</strong> Gmail caps ~500 recipients/day, Outlook.com ~300/day,
          and both prohibit unsolicited bulk email — high cold-outreach volume risks
          account suspension. The per-mailbox daily cap (Throttling in .env) is set low
          to protect your account. For real cold-email scale, use a dedicated domain + ESP.
        </div>
      </div>

      {identities.length > 0 && (
        <div className="card mt-6 p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Saved identities</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">From</th>
                <th className="th">Postal address</th>
                <th className="th">DNS</th>
                <th className="th">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {identities.map((i) => (
                <tr key={i.id}>
                  <td className="td font-medium text-gray-900">{i.fromName} &lt;{i.fromEmail}&gt;</td>
                  <td className="td text-gray-500">{i.postalAddress}</td>
                  <td className="td">
                    {i.dnsVerified ? (
                      <span className="badge bg-green-100 text-green-700">verified</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700">unverified</span>
                    )}
                  </td>
                  <td className="td">{i.isDefault ? "★" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
