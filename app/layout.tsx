import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cottonstone Command Center",
  description: "North Star OS — Personal Financial Intelligence Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
