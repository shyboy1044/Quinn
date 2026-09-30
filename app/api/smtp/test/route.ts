import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/smtp-provider";

// Verifies the SMTP connection + credentials without sending an email.
// Used by the Settings "Test connection" button.
export async function GET() {
  const provider = getEmailProvider();
  const result = await provider.verify();
  return NextResponse.json({
    configured: !provider.isDryRun,
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT || "587",
    user: process.env.SMTP_USER || null,
    ...result,
  });
}
