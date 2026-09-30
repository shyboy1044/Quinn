import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SenderIdentityInput } from "@/lib/validation";
import { defaultSenderIdentity } from "@/lib/compliance/identity";

export async function GET() {
  const identities = await prisma.senderIdentity.findMany({ orderBy: { updatedAt: "desc" } });
  const resolved = await defaultSenderIdentity();
  return NextResponse.json({ identities, resolved });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SenderIdentityInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Only one default at a time.
  if (data.isDefault) {
    await prisma.senderIdentity.updateMany({ data: { isDefault: false } });
  }

  const identity = await prisma.senderIdentity.create({
    data: {
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo ?? null,
      postalAddress: data.postalAddress,
      domain: data.domain ?? null,
      isDefault: data.isDefault ?? true,
    },
  });
  return NextResponse.json({ ok: true, identity });
}
