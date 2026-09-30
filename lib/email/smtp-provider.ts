import nodemailer, { Transporter } from "nodemailer";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "./types";

// SMTP adapter (nodemailer). Works with Gmail, Outlook.com, or any SMTP host.
//
// Configure via env:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
//
// If SMTP_HOST/USER/PASS are not all set, the provider runs in DRY-RUN mode:
// it logs the message and reports success without sending, so the whole
// pipeline is testable without real credentials.
//
// Bounce handling: SMTP has no delivery webhooks. A permanent recipient
// rejection (5xx) is surfaced as `permanentFailure` so the worker can
// auto-suppress the address at send time.

function readConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  // secure=true only for port 465 (implicit TLS); 587 uses STARTTLS.
  const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  return { host, user, pass, port, secure };
}

export class SmtpProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter: Transporter | null;

  constructor() {
    const { host, user, pass, port, secure } = readConfig();
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
    }
  }

  get isDryRun(): boolean {
    return this.transporter === null;
  }

  // Verify the SMTP connection + credentials (used by Settings "Test connection").
  async verify(): Promise<{ ok: boolean; error?: string; dryRun?: boolean }> {
    if (!this.transporter) return { ok: false, dryRun: true, error: "SMTP not configured" };
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.transporter) {
      console.log(`[DRY-RUN] would send to=${input.to} subject="${input.subject}"`);
      return { ok: true, dryRun: true, providerId: `dry_${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        to: input.to,
        from: input.from,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      });

      // If the server accepted the message but rejected this recipient,
      // treat it as a permanent failure.
      if (info.rejected && info.rejected.length > 0) {
        return {
          ok: false,
          error: `recipient rejected: ${info.rejected.join(", ")}`,
          permanentFailure: true,
        };
      }
      return { ok: true, providerId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, permanentFailure: isPermanentSmtpError(err) };
    }
  }
}

// SMTP 5xx codes are permanent (e.g. 550 mailbox unavailable). 4xx are
// transient (greylisting, rate limits) and should be retried, not suppressed.
function isPermanentSmtpError(err: unknown): boolean {
  const code = (err as { responseCode?: number })?.responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

let cached: SmtpProvider | null = null;

export function getEmailProvider(): SmtpProvider {
  if (!cached) cached = new SmtpProvider();
  return cached;
}
