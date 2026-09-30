"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";

interface Lead {
  id: string;
  username: string;
  name: string | null;
  publicEmail: string | null;
  company: string | null;
  profileUrl: string;
  source: string;
  imported: boolean;
}

export default function ResearchPage() {
  const [mode, setMode] = useState<"repo" | "org">("repo");
  const [target, setTarget] = useState("");
  const [maxUsers, setMaxUsers] = useState(50);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const data = await apiGet<{ leads: Lead[] }>("/api/research/github");
    setLeads(data.leads);
  }
  useEffect(() => {
    load();
  }, []);

  async function run() {
    setRunning(true);
    setMsg("");
    const payload = mode === "repo" ? { repo: target, maxUsers } : { org: target, maxUsers };
    const res = await apiSend<{ ok: boolean; error?: string; summary?: { scanned: number; withEmail: number } }>(
      "/api/research/github",
      "POST",
      payload,
    );
    if (res.ok && res.summary) {
      setMsg(`Scanned ${res.summary.scanned} profiles, found ${res.summary.withEmail} public emails.`);
      load();
    } else {
      setMsg(res.error || "Collection failed.");
    }
    setRunning(false);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function importSelected() {
    const res = await apiSend<{ ok: boolean; imported: number; skippedNoEmail: number }>(
      "/api/research/github/import",
      "POST",
      { leadIds: [...selected] },
    );
    if (res.ok) {
      setMsg(`Imported ${res.imported} contacts (${res.skippedNoEmail} had no public email).`);
      setSelected(new Set());
      load();
    }
  }

  const withEmail = leads.filter((l) => l.publicEmail);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">GitHub Research</h1>
      <p className="mt-1 text-sm text-gray-500">
        Collects only emails users have <strong>publicly published</strong> on
        their profile, via the official GitHub API. Nothing is auto-emailed —
        you review and import.
      </p>

      <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
        <strong>Consent is your responsibility.</strong> A public email is not
        consent to receive marketing. Imported leads land with consent =
        &ldquo;none&rdquo;; EU/Canada sends stay blocked until you have a lawful basis.
      </div>

      <div className="card mt-6 space-y-3">
        <div className="flex gap-2">
          <select className="input w-32" value={mode} onChange={(e) => setMode(e.target.value as "repo" | "org")}>
            <option value="repo">Repo</option>
            <option value="org">Org</option>
          </select>
          <input
            className="input flex-1"
            placeholder={mode === "repo" ? "owner/name  (e.g. vercel/next.js)" : "orgname  (e.g. vercel)"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <input
            className="input w-24"
            type="number"
            min={1}
            max={200}
            value={maxUsers}
            onChange={(e) => setMaxUsers(parseInt(e.target.value) || 50)}
          />
          <button className="btn-primary" onClick={run} disabled={running || !target.trim()}>
            {running ? "Collecting…" : "Collect"}
          </button>
        </div>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}
      </div>

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Leads ({leads.length}) · {withEmail.length} with public email
          </h2>
          <button className="btn-secondary text-xs" onClick={importSelected} disabled={selected.size === 0}>
            Import selected ({selected.size})
          </button>
        </div>
        {leads.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">No leads yet. Run a collection above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="th w-8"></th>
                  <th className="th">Username</th>
                  <th className="th">Name</th>
                  <th className="th">Public email</th>
                  <th className="th">Company</th>
                  <th className="th">Source</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((l) => (
                  <tr key={l.id} className={l.publicEmail ? "" : "opacity-50"}>
                    <td className="td">
                      <input
                        type="checkbox"
                        disabled={!l.publicEmail || l.imported}
                        checked={selected.has(l.id)}
                        onChange={() => toggle(l.id)}
                      />
                    </td>
                    <td className="td">
                      <a href={l.profileUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        @{l.username}
                      </a>
                    </td>
                    <td className="td">{l.name || "—"}</td>
                    <td className="td font-medium text-gray-900">{l.publicEmail || <span className="text-gray-400">not public</span>}</td>
                    <td className="td">{l.company || "—"}</td>
                    <td className="td text-gray-400 text-xs">{l.source}</td>
                    <td className="td">
                      {l.imported ? <span className="badge bg-green-100 text-green-700">imported</span> : <span className="text-gray-400 text-xs">—</span>}
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
