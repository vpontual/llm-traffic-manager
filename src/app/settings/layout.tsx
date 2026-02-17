import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings - Ollama Fleet Manager",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
