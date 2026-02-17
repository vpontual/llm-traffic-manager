"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./nav-bar";

const NO_NAV_ROUTES = ["/login", "/setup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !NO_NAV_ROUTES.includes(pathname);

  return (
    <>
      {showNav && <NavBar />}
      {children}
    </>
  );
}
