import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Automation Tool",
  description: "Compliant email outreach + GitHub research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
