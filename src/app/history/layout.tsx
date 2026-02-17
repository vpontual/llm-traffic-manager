import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History - Ollama Fleet Manager",
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
