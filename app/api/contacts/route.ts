import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ContactInput } from "@/lib/validation";

export async function GET() {
  const contacts = await prisma.contact.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ContactInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  const contact = await prisma.contact.upsert({
    where: { email },
    create: {
      email,
      name: data.name ?? null,
      company: data.company ?? null,
      region: data.region,
      consentStatus: data.consentStatus,
      tags: data.tags ?? "",
      source: "manual",
    },
    update: {
      name: data.name ?? undefined,
      company: data.company ?? undefined,
      region: data.region,
      consentStatus: data.consentStatus,
      tags: data.tags ?? undefined,
    },
  });
  return NextResponse.json({ ok: true, contact });
}
