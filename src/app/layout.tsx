// Root layout -- global styles and metadata

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ollama Fleet Manager",
  description: "Monitor and manage your Ollama GPU servers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface antialiased">
        {children}
      </body>
    </html>
  );
}
