"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/client";

interface PreviewData {
  ok: boolean;
  preview: { subject: string; html: string; from: string };
  audience: { total: number; allowed: number; blocked: number; reasons: Record<string, number> };
  checklist: {
    hasPostalAddress: boolean;
    dnsVerified: boolean;
    footerIncluded: boolean;
    listUnsubscribeHeader: boolean;
  };
}

interface CampaignData {
  ok: boolean;
  campaign: { id: string; name: string; subject: string; status: string; fromEmail: string };
  stats: Record<string, number>;
}

export default function CampaignDetail() {
  const params = useParams();
  const id = params.id as string;
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [data, setData] = useState<CampaignData | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string>("");

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      apiGet<PreviewData>(`/api/campaigns/${id}/preview`),
      apiGet<CampaignData>(`/api/campaigns/${id}`),
    ]);
    setPreview(p);
    setData(d);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setSending(true);
    setResult("");
    const res = await apiSend<{ ok: boolean; result?: { sent: number; skipped: number; failed: number; bounced: number; budgetRemaining: number; dryRun: boolean } }>(
      `/api/campaigns/${id}/send`,
      "POST",
      {},
    );
    if (res.ok && res.result) {
      const r = res.result;
      setResult(
        `${r.dryRun ? "[DRY-RUN] " : ""}Sent ${r.sent}, skipped ${r.skipped}, bounced ${r.bounced}, failed ${r.failed}. Budget left today: ${r.budgetRemaining}.`,
      );
    } else {
      setResult("Send failed.");
    }
    setSending(false);
    load();
  }

  if (!preview || !data) return <div className="text-sm text-gray-400">Loading…</div>;

  const c = data.campaign;
  const checks = [
    { ok: preview.checklist.hasPostalAddress, label: "Physical postal address set (CAN-SPAM)" },
    { ok: preview.checklist.footerIncluded, label: "Unsubscribe link in footer" },
    { ok: preview.checklist.listUnsubscribeHeader, label: "List-Unsubscribe header (one-click)" },
    { ok: preview.checklist.dnsVerified, label: "Sending domain DNS verified (SPF/DKIM/DMARC)", warn: true },
  ];
  const blockingIssues = checks.filter((x) => !x.ok && !x.warn).length;
  const canSend = blockingIssues === 0 && preview.audience.allowed > 0;

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-brand-600 hover:underline">← Campaigns</Link>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
          <p className="mt-1 text-sm text-gray-500">From {c.fromEmail} · status {c.status}</p>
        </div>
        <button className="btn-primary" onClick={send} disabled={!canSend || sending}>
          {sending ? "Sending…" : `Send to ${preview.audience.allowed} allowed`}
        </button>
      </div>

      {result && <div className="mt-4 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">{result}</div>}
      {!canSend && blockingIssues > 0 && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          Resolve the blocking compliance items below before sending.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Compliance checklist */}
        <div className="card">
          <h2 className="font-semibold text-gray-900">Compliance checklist</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checks.map((x) => (
              <li key={x.label} className="flex items-start gap-2">
                <span className={x.ok ? "text-green-600" : x.warn ? "text-amber-500" : "text-red-600"}>
                  {x.ok ? "✓" : x.warn ? "!" : "✕"}
                </span>
                <span className={x.ok ? "text-gray-700" : "text-gray-900"}>{x.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Audience */}
        <div className="card">
          <h2 className="font-semibold text-gray-900">Audience</h2>
          <div className="mt-3 flex gap-4">
            <div>
              <div className="text-2xl font-bold text-green-600">{preview.audience.allowed}</div>
              <div className="text-xs text-gray-500">allowed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-400">{preview.audience.blocked}</div>
              <div className="text-xs text-gray-500">blocked</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{preview.audience.total}</div>
              <div className="text-xs text-gray-500">total</div>
            </div>
          </div>
          {Object.keys(preview.audience.reasons).length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-gray-500">
              {Object.entries(preview.audience.reasons).map(([reason, n]) => (
                <li key={reason}>· {n} {reason}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Send stats */}
        <div className="card">
          <h2 className="font-semibold text-gray-900">Delivery status</h2>
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {["sent", "delivered", "bounced", "complained", "unsubscribed", "skipped", "failed", "queued"].map((s) => (
              <li key={s} className="flex justify-between">
                <span className="capitalize">{s}</span>
                <span className="font-medium text-gray-900">{data.stats[s] || 0}</span>
              </li>
            ))}
          </ul>
          <button className="btn-secondary mt-3 w-full text-xs" onClick={load}>Refresh</button>
        </div>
      </div>

      {/* Email preview */}
      <div className="card mt-6">
        <h2 className="font-semibold text-gray-900">Email preview</h2>
        <div className="mt-2 text-xs text-gray-500">
          <div><strong>From:</strong> {preview.preview.from}</div>
          <div><strong>Subject:</strong> {preview.preview.subject}</div>
        </div>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
          <div dangerouslySetInnerHTML={{ __html: preview.preview.html }} />
        </div>
      </div>
    </div>
  );
}
