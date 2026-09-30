import { prisma } from "@/lib/db";

// Reputation protection: cap sends per mailbox per day and space them out.
// The cap is per FROM address (the mailbox), not per campaign, matching how
// mailbox providers judge reputation.

export function dailyLimit(): number {
  const n = parseInt(process.env.DAILY_SEND_LIMIT || "40", 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export function sendDelayMs(): number {
  const n = parseInt(process.env.SEND_DELAY_MS || "1500", 10);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
}

// How many messages this FROM address has already sent today (UTC day).
export async function sentTodayForFrom(fromEmail: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  return prisma.send.count({
    where: {
      sentAt: { gte: startOfDay },
      status: { in: ["sent", "delivered"] },
      campaign: { fromEmail },
    },
  });
}

// Remaining budget for a mailbox today.
export async function remainingBudget(fromEmail: string): Promise<number> {
  const used = await sentTodayForFrom(fromEmail);
  return Math.max(0, dailyLimit() - used);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
