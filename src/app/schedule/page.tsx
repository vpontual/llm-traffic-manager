"use client";

// Schedule page -- manage cron-based model scheduling with conflict detection

import { useState } from "react";
import useSWR, { mutate } from "swr";
import type { ScheduledJob, ScheduledExecution, ConflictGroup } from "@/lib/types";
import { ScheduleTimeline } from "@/components/schedule-timeline";
import { JobCard } from "@/components/job-card";
import { JobForm, type JobFormData } from "@/components/job-form";
import { ConflictAlert } from "@/components/conflict-alert";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TimelineData {
  executions: ScheduledExecution[];
  conflicts: ConflictGroup[];
}

interface ServerState {
  id: number;
  name: string;
  availableModels: { name: string }[];
}

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

export default function SchedulePage() {
  const [hours, setHours] = useState(24);
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    added: number;
    skipped: number;
    addedJobs: string[];
    skippedJobs: string[];
  } | null>(null);

  const { data: jobs, isLoading: jobsLoading } = useSWR<ScheduledJob[]>(
    "/api/scheduled-jobs",
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: timeline } = useSWR<TimelineData>(
    `/api/scheduled-jobs/timeline?hours=${hours}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: servers } = useSWR<ServerState[]>("/api/servers", fetcher);

  // Get unique models from all servers
  const availableModels = [
    ...new Set(
      (servers ?? []).flatMap((s) => s.availableModels.map((m) => m.name))
    ),
  ].sort();

  const serverList = (servers ?? []).map((s) => ({ id: s.id, name: s.name }));

  const handleCreateJob = async (data: JobFormData) => {
    const res = await fetch("/api/scheduled-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create job");
    }

    setShowForm(false);
    mutate("/api/scheduled-jobs");
    mutate(`/api/scheduled-jobs/timeline?hours=${hours}`);
  };

  const handleUpdateJob = async (data: JobFormData) => {
    if (!editingJob) return;

    const res = await fetch(`/api/scheduled-jobs/${editingJob.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update job");
    }

    setEditingJob(null);
    mutate("/api/scheduled-jobs");
    mutate(`/api/scheduled-jobs/timeline?hours=${hours}`);
  };

  const handleToggleJob = async (job: ScheduledJob) => {
    await fetch(`/api/scheduled-jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !job.isEnabled }),
    });

    mutate("/api/scheduled-jobs");
    mutate(`/api/scheduled-jobs/timeline?hours=${hours}`);
  };

  const handleDeleteJob = async (job: ScheduledJob) => {
    if (!confirm(`Delete job "${job.name}"? This cannot be undone.`)) {
      return;
    }

    await fetch(`/api/scheduled-jobs/${job.id}`, {
      method: "DELETE",
    });

    mutate("/api/scheduled-jobs");
    mutate(`/api/scheduled-jobs/timeline?hours=${hours}`);
  };

  const handleJobClick = (jobId: number) => {
    const job = jobs?.find((j) => j.id === jobId);
    if (job) {
      setEditingJob(job);
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch("/api/scheduled-jobs/discover", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setDiscoverResult(data);
        mutate("/api/scheduled-jobs");
        mutate(`/api/scheduled-jobs/timeline?hours=${hours}`);
      } else {
        alert(data.error || "Discovery failed");
      }
    } catch (err) {
      alert("Discovery failed - is Docker socket mounted?");
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <div id="main-content" className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">
          Scheduled Jobs
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.hours}
                onClick={() => setHours(range.hours)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  hours === range.hours
                    ? "bg-accent text-white"
                    : "bg-surface-raised text-text-muted hover:text-text-secondary border border-border"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="px-4 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors disabled:opacity-50"
          >
            {discovering ? "Discovering..." : "Discover Jobs"}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            Add Job
          </button>
        </div>
      </div>

      {/* Discovery Result */}
      {discoverResult && (
        <div className="mb-6 bg-surface-raised border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary">
              Discovery Results
            </h3>
            <button
              onClick={() => setDiscoverResult(null)}
              className="text-text-muted hover:text-text-secondary"
              aria-label="Dismiss discovery results"
            >
              &times;
            </button>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            Added {discoverResult.added} job{discoverResult.added !== 1 ? "s" : ""},
            skipped {discoverResult.skipped}
          </p>
          {discoverResult.addedJobs.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-success mb-1">Added:</p>
              <ul className="text-xs text-text-muted">
                {discoverResult.addedJobs.map((name) => (
                  <li key={name}>+ {name}</li>
                ))}
              </ul>
            </div>
          )}
          {discoverResult.skippedJobs.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Skipped:</p>
              <ul className="text-xs text-text-muted">
                {discoverResult.skippedJobs.slice(0, 5).map((name) => (
                  <li key={name}>- {name}</li>
                ))}
                {discoverResult.skippedJobs.length > 5 && (
                  <li>...and {discoverResult.skippedJobs.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {(showForm || editingJob) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-form-title"
        >
          <div className="bg-surface-raised border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 id="job-form-title" className="text-lg font-semibold text-text-primary mb-4">
              {editingJob ? "Edit Job" : "Create Job"}
            </h2>
            <JobForm
              job={editingJob}
              models={availableModels}
              servers={serverList}
              onSubmit={editingJob ? handleUpdateJob : handleCreateJob}
              onCancel={() => {
                setShowForm(false);
                setEditingJob(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Timeline */}
      <section className="mb-6">
        <ScheduleTimeline
          executions={timeline?.executions ?? []}
          conflicts={timeline?.conflicts ?? []}
          hours={hours}
          onJobClick={handleJobClick}
        />
      </section>

      {/* Conflicts */}
      {timeline?.conflicts && timeline.conflicts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Scheduling Conflicts
          </h2>
          <ConflictAlert
            conflicts={timeline.conflicts}
            onJobClick={handleJobClick}
          />
        </section>
      )}

      {/* Jobs Grid */}
      <section>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          All Jobs ({jobs?.length ?? 0})
        </h2>
        {jobsLoading ? (
          <div className="bg-surface-raised border border-border rounded-xl p-6 text-center text-text-muted" aria-live="polite">
            Loading...
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="bg-surface-raised border border-border rounded-xl p-6 text-center">
            <p className="text-text-muted mb-4">No scheduled jobs yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              Create Your First Job
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onEdit={setEditingJob}
                onToggle={handleToggleJob}
                onDelete={handleDeleteJob}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
