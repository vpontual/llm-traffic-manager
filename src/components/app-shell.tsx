"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./nav-bar";
import { FleetTicker } from "./fleet-ticker";

const NO_NAV_ROUTES = ["/login", "/setup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = !NO_NAV_ROUTES.includes(pathname);

  return (
    <>
      {showNav && <FleetTicker />}
      {showNav && <NavBar />}
      {children}
    </>
  );
}
