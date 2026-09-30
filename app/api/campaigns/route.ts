import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CampaignInput } from "@/lib/validation";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sends: true } } },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CampaignInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }
  const campaign = await prisma.campaign.create({ data: parsed.data });
  return NextResponse.json({ ok: true, campaign });
}
