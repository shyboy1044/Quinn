import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidEmail } from "@/lib/compliance/guard";

export async function GET() {
  const entries = await prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ entries });
}

// Manually add an address to the suppression list.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }
  const entry = await prisma.suppressionEntry.upsert({
    where: { email },
    create: { email, reason: "manual", detail: body?.detail ?? null },
    update: {},
  });
  return NextResponse.json({ ok: true, entry });
}
