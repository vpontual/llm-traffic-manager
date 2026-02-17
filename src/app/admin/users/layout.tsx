import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users - LLM Traffic Manager",
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
