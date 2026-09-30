import { buildHtmlFooter, buildTextFooter, unsubscribeHeaders } from "@/lib/compliance/footer";
import type { SendEmailInput } from "./types";

export interface MergeVars {
  name?: string | null;
  company?: string | null;
  email: string;
}

// Replace {{name}}, {{company}}, {{email}} tokens. Unknown tokens are left
// blank rather than leaking "{{...}}" into the message.
export function renderMergeTokens(template: string, vars: MergeVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    switch (key) {
      case "name":
        return vars.name ?? "there";
      case "company":
        return vars.company ?? "";
      case "email":
        return vars.email;
      default:
        return "";
    }
  });
}

export interface ComposeInput {
  to: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  bodyHtml: string;
  postalAddress: string;
  vars: MergeVars;
}

// Produce a fully compliant SendEmailInput: merged body + mandatory footer
// (unsubscribe link + postal address) + List-Unsubscribe headers.
export function composeCompliantEmail(input: ComposeInput): SendEmailInput {
  const subject = renderMergeTokens(input.subject, input.vars);
  const mergedBody = renderMergeTokens(input.bodyHtml, input.vars);

  const footer = buildHtmlFooter({
    recipientEmail: input.to,
    postalAddress: input.postalAddress,
    fromName: input.fromName,
  });
  const html = `${mergedBody}\n${footer}`;

  const textBody = htmlToText(mergedBody);
  const text =
    textBody +
    buildTextFooter({
      recipientEmail: input.to,
      postalAddress: input.postalAddress,
      fromName: input.fromName,
    });

  return {
    to: input.to,
    from: `${input.fromName} <${input.fromEmail}>`,
    replyTo: input.replyTo,
    subject,
    html,
    text,
    headers: unsubscribeHeaders(input.to),
  };
}

// Minimal HTML-to-text for the plain-text alternative part. A multipart
// message (html + text) improves inbox placement vs html-only.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
