import { Octokit } from "@octokit/rest";

// GitHub research collector.
//
// Compliance notes (see plan): uses the OFFICIAL REST API only, which
// respects GitHub's ToS and rate limits. It collects ONLY the email a user
// has chosen to publish publicly on their profile (`GET /users/{username}`
// returns `email` = null otherwise). Results are stored as leads and are
// NEVER auto-emailed — a human reviews and imports them.

export interface CollectedLead {
  username: string;
  name: string | null;
  publicEmail: string | null;
  company: string | null;
  profileUrl: string;
  source: string;
}

export interface CollectOptions {
  // Only one of these should be set.
  repo?: string; // "owner/name" — collect contributors of a repo
  org?: string; // "orgname" — collect public members of an org
  maxUsers?: number; // safety cap on how many profiles to fetch
}

export interface CollectSummary {
  source: string;
  scanned: number;
  withEmail: number;
  leads: CollectedLead[];
  rateLimitRemaining: number | null;
}

function makeClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  // A token is required to read public emails and get the 5,000 req/hr limit.
  return new Octokit(token ? { auth: token } : {});
}

export async function collectFromGitHub(opts: CollectOptions): Promise<CollectSummary> {
  const octokit = makeClient();
  const maxUsers = Math.min(opts.maxUsers ?? 50, 200);

  let usernames: string[] = [];
  let source = "";

  if (opts.repo) {
    const [owner, repo] = opts.repo.split("/");
    if (!owner || !repo) throw new Error('repo must be "owner/name"');
    source = `repo:${opts.repo}`;
    const contributors = await octokit.paginate(
      octokit.repos.listContributors,
      { owner, repo, per_page: 100 },
      (response) => response.data,
    );
    usernames = contributors
      .map((c) => c.login)
      .filter((l): l is string => Boolean(l))
      .slice(0, maxUsers);
  } else if (opts.org) {
    source = `org:${opts.org}`;
    const members = await octokit.paginate(
      octokit.orgs.listMembers,
      { org: opts.org, per_page: 100 },
      (response) => response.data,
    );
    usernames = members.map((m) => m.login).slice(0, maxUsers);
  } else {
    throw new Error("Provide either a repo or an org to collect from");
  }

  const leads: CollectedLead[] = [];
  let withEmail = 0;
  let rateLimitRemaining: number | null = null;

  for (const username of usernames) {
    const { data: user, headers } = await octokit.users.getByUsername({ username });
    rateLimitRemaining = parseInt(String(headers["x-ratelimit-remaining"] ?? ""), 10) || rateLimitRemaining;

    const publicEmail = user.email ?? null; // null unless the user published it
    if (publicEmail) withEmail++;

    leads.push({
      username: user.login,
      name: user.name ?? null,
      publicEmail,
      company: user.company ?? null,
      profileUrl: user.html_url,
      source,
    });
  }

  return {
    source,
    scanned: usernames.length,
    withEmail,
    leads,
    rateLimitRemaining,
  };
}
