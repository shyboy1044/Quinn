import { unsubscribeUrl } from "./unsubscribe";

// CAN-SPAM requires every commercial email to contain:
//  - a clear, working unsubscribe mechanism
//  - the sender's valid physical postal address
// This builder appends both. Sending is blocked upstream if the postal
// address is missing (see send-guard).

export interface FooterInput {
  recipientEmail: string;
  postalAddress: string;
  fromName: string;
}

export function buildHtmlFooter(input: FooterInput): string {
  const url = unsubscribeUrl(input.recipientEmail);
  const address = escapeHtml(input.postalAddress);
  const name = escapeHtml(input.fromName);
  return `
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px" />
<div style="font-size:12px;color:#6b7280;line-height:1.5;font-family:Arial,Helvetica,sans-serif">
  <p style="margin:0 0 8px">
    You received this email from ${name}.
  </p>
  <p style="margin:0 0 8px">${address}</p>
  <p style="margin:0">
    <a href="${url}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>
    &nbsp;·&nbsp; We will stop emailing you promptly.
  </p>
</div>`.trim();
}

export function buildTextFooter(input: FooterInput): string {
  const url = unsubscribeUrl(input.recipientEmail);
  return [
    "",
    "----",
    `You received this email from ${input.fromName}.`,
    input.postalAddress,
    `Unsubscribe: ${url}`,
  ].join("\n");
}

// The List-Unsubscribe headers enable one-click unsubscribe in Gmail/
// Outlook, which the 2024+ bulk-sender rules require.
export function unsubscribeHeaders(recipientEmail: string): Record<string, string> {
  const url = unsubscribeUrl(recipientEmail);
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
