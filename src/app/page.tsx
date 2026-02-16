"use client";

// Dashboard -- main fleet overview with server cards and activity

import useSWR from "swr";
import { ServerGrid } from "@/components/server-grid";
import { FleetSummary } from "@/components/fleet-summary";
import { TimelineChart } from "@/components/timeline-chart";
import { AvailableModels } from "@/components/available-models";
import { ServerActivity } from "@/components/server-activity";
import type { ServerState, ModelEvent, ServerEvent } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [timelineHours, setTimelineHours] = useState(24);

  const { data: servers, isLoading: serversLoading } = useSWR<ServerState[]>(
    "/api/servers",
    fetcher,
    { refreshInterval: 5000 }
  );

  const { data: events } = useSWR<ModelEvent[]>(
    `/api/events?hours=${timelineHours}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const { data: serverEventData } = useSWR<ServerEvent[]>(
    "/api/server-events?hours=24",
    fetcher,
    { refreshInterval: 10000 }
  );

  // Track time since last data update
  const lastUpdated = useRef<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (servers) lastUpdated.current = Date.now();
  }, [servers]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalOnline = servers?.filter((s) => s.isOnline).length ?? 0;
  const totalModels =
    servers?.reduce((sum, s) => sum + s.loadedModels.length, 0) ?? 0;

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Ollama Fleet Manager
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {totalOnline} server{totalOnline !== 1 ? "s" : ""} online
            {" / "}
            {totalModels} model{totalModels !== 1 ? "s" : ""} loaded
          </p>
        </div>
        <div className="flex items-center gap-3">
          {servers && (
            <span className="text-xs text-text-muted">
              Updated {secondsAgo < 2 ? "just now" : `${secondsAgo}s ago`}
            </span>
          )}
          <Link
            href="/schedule"
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Schedule
          </Link>
          <Link
            href="/analytics"
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Analytics
          </Link>
          <Link
            href="/history"
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            History
          </Link>
          <button
            onClick={() => fetch("/api/poll", { method: "POST" })}
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Refresh
          </button>
          <Link
            href="/settings"
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Settings
          </Link>
          {user?.isAdmin && (
            <Link
              href="/admin/users"
              className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
            >
              Users
            </Link>
          )}
          <button
            onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"))}
            className="px-3 py-1.5 text-sm bg-surface-raised border border-red-800/50 rounded-lg text-red-400 hover:text-red-300 hover:border-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Loading state */}
      {serversLoading && (
        <div className="text-center py-20 text-text-muted">
          Connecting to servers...
        </div>
      )}

      {/* Server cards */}
      {servers && (
        <>
          <section className="mb-6">
            <ServerGrid servers={servers} />
          </section>

          {/* Fleet summary */}
          <section className="mb-6">
            <FleetSummary servers={servers} />
          </section>

          {/* Server activity log */}
          {serverEventData && serverEventData.length > 0 && (
            <section className="mb-6">
              <ServerActivity events={serverEventData} />
            </section>
          )}

          {/* Available models across fleet */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              Available Models
            </h2>
            <AvailableModels servers={servers} />
          </section>

          {/* Timeline */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
                Model Timeline
              </h2>
              <div className="flex gap-1">
                {[1, 6, 24, 168].map((h) => (
                  <button
                    key={h}
                    onClick={() => setTimelineHours(h)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      timelineHours === h
                        ? "bg-accent text-white"
                        : "bg-surface-raised text-text-muted hover:text-text-secondary border border-border"
                    }`}
                  >
                    {h < 24 ? `${h}h` : h === 24 ? "24h" : "7d"}
                  </button>
                ))}
              </div>
            </div>
            <TimelineChart
              events={events ?? []}
              servers={
                servers?.map((s) => ({ id: s.id, name: s.name })) ?? []
              }
              hours={timelineHours}
            />
          </section>
        </>
      )}
    </div>
  );
}
