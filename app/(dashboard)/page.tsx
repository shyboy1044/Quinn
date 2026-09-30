import { prisma } from "@/lib/db";
import { defaultSenderIdentity } from "@/lib/compliance/identity";
import { getEmailProvider } from "@/lib/email/smtp-provider";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const [contacts, campaigns, suppressed, leads, sent, identity] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.suppressionEntry.count(),
    prisma.githubLead.count(),
    prisma.send.count({ where: { status: { in: ["sent", "delivered"] } } }),
    defaultSenderIdentity(),
  ]);

  const provider = getEmailProvider();
  const dryRun = provider.isDryRun;

  const stats = [
    { label: "Contacts", value: contacts, href: "/contacts" },
    { label: "Campaigns", value: campaigns, href: "/campaigns" },
    { label: "Emails sent", value: sent, href: "/campaigns" },
    { label: "Suppressed", value: suppressed, href: "/suppression" },
    { label: "GitHub leads", value: leads, href: "/research" },
  ];

  const identityComplete =
    identity.fromEmail.includes("@") && identity.postalAddress.trim().length >= 5;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Overview of your outreach program.
      </p>

      {dryRun && (
        <div className="mt-5 rounded-lg bg-blue-50 p-4 text-sm text-blue-800 ring-1 ring-blue-100">
          <strong>Dry-run mode.</strong> SMTP is not configured, so campaigns
          simulate sending without delivering real email. Set{" "}
          <code className="rounded bg-blue-100 px-1">SMTP_HOST</code>,{" "}
          <code className="rounded bg-blue-100 px-1">SMTP_USER</code> and{" "}
          <code className="rounded bg-blue-100 px-1">SMTP_PASS</code> in{" "}
          <code className="rounded bg-blue-100 px-1">.env</code> to send for real.
        </div>
      )}

      {!identityComplete && (
        <div className="mt-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
          <strong>Sender identity incomplete.</strong> A From address and a
          physical postal address are legally required.{" "}
          <Link href="/settings" className="underline font-medium">
            Complete it in Settings →
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:ring-brand-100">
            <div className="text-3xl font-bold text-gray-900">{s.value}</div>
            <div className="mt-1 text-sm text-gray-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold text-gray-900">Get started</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-600 list-decimal list-inside">
            <li>Set your sender identity in <Link className="text-brand-600 underline" href="/settings">Settings</Link></li>
            <li>Add or import <Link className="text-brand-600 underline" href="/contacts">Contacts</Link></li>
            <li>Create a <Link className="text-brand-600 underline" href="/campaigns">Campaign</Link> and preview compliance</li>
            <li>Send — the guard blocks anything non-compliant</li>
          </ol>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900">How deliverability works here</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 list-disc list-inside">
            <li>Send via your Gmail / Outlook SMTP mailbox</li>
            <li>Every email carries an unsubscribe link + postal address</li>
            <li>Hard SMTP rejections (bounces) auto-suppress</li>
            <li>Per-mailbox daily cap protects your account & reputation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
