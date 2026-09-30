import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GithubCollectInput } from "@/lib/validation";
import { collectFromGitHub } from "@/lib/github/collector";

// Run a GitHub research collection. Stores results as GithubLead rows.
// These are NOT contacts and are never auto-emailed — a human reviews and
// imports them via /api/research/github/import.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = GithubCollectInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_TOKEN not set. A token is required to read public emails." },
      { status: 400 },
    );
  }

  try {
    const summary = await collectFromGitHub(parsed.data);

    // Persist leads (upsert by username).
    for (const lead of summary.leads) {
      await prisma.githubLead.upsert({
        where: { username: lead.username },
        create: {
          username: lead.username,
          name: lead.name,
          publicEmail: lead.publicEmail,
          company: lead.company,
          profileUrl: lead.profileUrl,
          source: lead.source,
        },
        update: {
          name: lead.name ?? undefined,
          publicEmail: lead.publicEmail ?? undefined,
          company: lead.company ?? undefined,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        source: summary.source,
        scanned: summary.scanned,
        withEmail: summary.withEmail,
        rateLimitRemaining: summary.rateLimitRemaining,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const leads = await prisma.githubLead.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ leads });
}
