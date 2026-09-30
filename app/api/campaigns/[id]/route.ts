import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Campaign detail with live send-status counts for the dashboard.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const grouped = await prisma.send.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { status: true },
  });
  const stats: Record<string, number> = {};
  for (const g of grouped) stats[g.status] = g._count.status;

  return NextResponse.json({ ok: true, campaign, stats });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
