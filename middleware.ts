import { NextRequest, NextResponse } from "next/server";

// HTTP Basic auth for the whole app. Without it, anyone who finds the deployed
// URL could read the contact list and send email from the configured mailbox.
//
// - Set AUTH_USER and AUTH_PASSWORD to enable.
// - In production, missing credentials refuse every request (fail closed).
// - In development, missing credentials leave the app open for convenience.
// - /api/unsubscribe stays public: recipients and mailbox providers (RFC 8058
//   one-click POST) must reach it without logging in. It is protected by a
//   signed token instead.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/unsubscribe).*)"],
};

// Compares every character so timing does not reveal how much matched.
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function challenge() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Quinn", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const user = process.env.AUTH_USER;
  const pass = process.env.AUTH_PASSWORD;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Server misconfigured: AUTH_USER and AUTH_PASSWORD are not set", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return challenge();

  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return challenge();
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return challenge();

  const okUser = safeEqual(decoded.slice(0, sep), user);
  const okPass = safeEqual(decoded.slice(sep + 1), pass);
  return okUser && okPass ? NextResponse.next() : challenge();
}
