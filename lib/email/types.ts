export interface SendEmailInput {
  to: string;
  from: string; // "Name <email@domain>"
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  dryRun?: boolean;
  // True when the SMTP server rejected the recipient permanently (5xx),
  // e.g. mailbox does not exist. The worker treats this as a bounce and
  // auto-suppresses the address. Unlike Resend there is no webhook, so
  // bounce detection happens here, at send time.
  permanentFailure?: boolean;
}

// The ESP adapter interface. SMTP (nodemailer) is the implementation used
// here; any other provider (e.g. an API-based ESP) can be dropped in behind
// the same interface without touching the send worker.
export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
