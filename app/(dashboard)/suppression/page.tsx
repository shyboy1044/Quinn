"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";

interface Entry {
  id: string;
  email: string;
  reason: string;
  detail: string | null;
  createdAt: string;
}

const reasonColors: Record<string, string> = {
  unsubscribe: "bg-blue-100 text-blue-700",
  bounce: "bg-amber-100 text-amber-700",
  complaint: "bg-red-100 text-red-700",
  manual: "bg-gray-100 text-gray-600",
};

export default function SuppressionPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [email, setEmail] = useState("");

  async function load() {
    const data = await apiGet<{ entries: Entry[] }>("/api/suppression");
    setEntries(data.entries);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    const res = await apiSend<{ ok: boolean }>("/api/suppression", "POST", { email });
    if (res.ok) {
      setEmail("");
      load();
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Suppression list</h1>
      <p className="mt-1 text-sm text-gray-500">
        These addresses are permanently blocked from all sends. Unsubscribes,
        bounces, and complaints are added automatically.
      </p>

      <div className="card mt-6 flex gap-2">
        <input
          className="input flex-1"
          type="email"
          placeholder="Add an address to suppress manually"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn-secondary" onClick={add} disabled={!email.includes("@")}>
          Suppress
        </button>
      </div>

      <div className="card mt-6 p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Suppressed ({entries.length})</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">Nothing suppressed yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Email</th>
                <th className="th">Reason</th>
                <th className="th">Detail</th>
                <th className="th">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="td font-medium text-gray-900">{e.email}</td>
                  <td className="td">
                    <span className={`badge ${reasonColors[e.reason] || reasonColors.manual}`}>{e.reason}</span>
                  </td>
                  <td className="td text-gray-500">{e.detail || "—"}</td>
                  <td className="td text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
