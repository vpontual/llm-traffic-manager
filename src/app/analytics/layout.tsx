import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics - LLM Traffic Manager",
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
