import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History - LLM Traffic Manager",
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
