import { prisma } from "@/lib/db";

export interface ResolvedIdentity {
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  postalAddress: string;
  dnsVerified: boolean;
}

// Resolve the sender identity used for compliance/composition. Prefers the
// default identity stored in the DB (set via Settings), and falls back to
// environment variables so the app works before any identity is created.
export async function defaultSenderIdentity(): Promise<ResolvedIdentity> {
  const stored = await prisma.senderIdentity.findFirst({
    where: { isDefault: true },
    orderBy: { updatedAt: "desc" },
  });

  if (stored) {
    return {
      fromName: stored.fromName,
      fromEmail: stored.fromEmail,
      replyTo: stored.replyTo ?? undefined,
      postalAddress: stored.postalAddress,
      dnsVerified: stored.dnsVerified,
    };
  }

  return {
    fromName: process.env.SENDER_FROM_NAME || "",
    fromEmail: process.env.SENDER_FROM_EMAIL || "",
    replyTo: process.env.SENDER_REPLY_TO || undefined,
    postalAddress: process.env.SENDER_POSTAL_ADDRESS || "",
    dnsVerified: false,
  };
}
