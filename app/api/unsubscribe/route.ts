import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/compliance/unsubscribe";

// Adds an email to the permanent suppression list.
async function suppress(email: string) {
  const normalized = email.trim().toLowerCase();
  await prisma.suppressionEntry.upsert({
    where: { email: normalized },
    create: { email: normalized, reason: "unsubscribe" },
    update: {}, // already suppressed — keep original record
  });
  // Reflect on any queued sends for this address.
  await prisma.send.updateMany({
    where: { email: normalized, status: "queued" },
    data: { status: "unsubscribed", skipReason: "unsubscribe" },
  });
}

// One-click unsubscribe (List-Unsubscribe-Post). Mailbox providers POST here.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";
  if (!email || !verifyToken(email, token)) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 400 });
  }
  await suppress(email);
  return NextResponse.json({ ok: true });
}

// Human clicks the unsubscribe link in the footer.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") ?? "";
  const token = searchParams.get("token") ?? "";

  const valid = email && verifyToken(email, token);
  if (valid) await suppress(email);

  const html = valid
    ? `<h1>You're unsubscribed</h1><p><strong>${escapeHtml(email)}</strong> will no longer receive emails from us.</p>`
    : `<h1>Invalid link</h1><p>This unsubscribe link is invalid or expired.</p>`;

  return new NextResponse(pageShell(html), {
    status: valid ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function pageShell(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><style>body{font-family:system-ui,Arial,sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#111}h1{font-size:22px}p{color:#444;line-height:1.6}</style></head><body>${inner}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
