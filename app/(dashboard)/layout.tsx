import Nav from "@/components/Nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-white p-4">
        <div className="mb-6 px-3">
          <div className="text-lg font-bold text-gray-900">Outreach</div>
          <div className="text-xs text-gray-400">Compliant email automation</div>
        </div>
        <Nav />
        <div className="mt-8 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
          <strong>Compliance on.</strong> Unsubscribe, suppression, and EU/CA
          consent checks run on every send.
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  );
}
