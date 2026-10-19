import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "where did my crypto go?",
  description: "Track your spending across multiple cards.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-900 text-neutral-200 font-mono">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
