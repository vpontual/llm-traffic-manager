"use client";

import { useState, useEffect } from "react";
import type { ScheduledJob } from "@/lib/types";
import { isValidCron, describeCron, getNextExecutions } from "@/lib/cron-utils";

interface JobFormProps {
  job?: ScheduledJob | null;
  models: string[];
  servers: { id: number; name: string }[];
  onSubmit: (data: JobFormData) => Promise<void>;
  onCancel: () => void;
}

export interface JobFormData {
  name: string;
  description: string;
  sourceIdentifier: string;
  cronExpression: string;
  timezone: string;
  targetModel: string;
  preferredServerId: number | null;
  expectedDurationMs: number;
}

const DURATION_PRESETS = [
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "5 minutes", value: 300000 },
  { label: "15 minutes", value: 900000 },
  { label: "30 minutes", value: 1800000 },
  { label: "1 hour", value: 3600000 },
];

export function JobForm({ job, models, servers, onSubmit, onCancel }: JobFormProps) {
  const [name, setName] = useState(job?.name ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [sourceIdentifier, setSourceIdentifier] = useState(
    job?.sourceIdentifier ?? ""
  );
  const [cronExpression, setCronExpression] = useState(
    job?.cronExpression ?? "0 * * * *"
  );
  const [timezone, setTimezone] = useState(job?.timezone ?? "UTC");
  const [targetModel, setTargetModel] = useState(job?.targetModel ?? "");
  const [preferredServerId, setPreferredServerId] = useState<number | null>(
    job?.preferredServerId ?? null
  );
  const [expectedDurationMs, setExpectedDurationMs] = useState(
    job?.expectedDurationMs ?? 60000
  );
  const [customDuration, setCustomDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cron validation and preview
  const cronValid = isValidCron(cronExpression);
  const cronDesc = cronValid ? describeCron(cronExpression) : "";
  const nextRuns = cronValid
    ? getNextExecutions(cronExpression, 5, expectedDurationMs, timezone)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!sourceIdentifier.trim()) {
      setError("Source identifier is required");
      return;
    }
    if (!cronValid) {
      setError("Invalid cron expression");
      return;
    }
    if (!targetModel) {
      setError("Target model is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        sourceIdentifier: sourceIdentifier.trim(),
        cronExpression,
        timezone,
        targetModel,
        preferredServerId,
        expectedDurationMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save job");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDurationChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      setExpectedDurationMs(parsed);
      setCustomDuration("");
    }
  };

  const handleCustomDurationChange = (value: string) => {
    setCustomDuration(value);
    const minutes = parseInt(value, 10);
    if (!isNaN(minutes) && minutes > 0) {
      setExpectedDurationMs(minutes * 60000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div aria-live="assertive">
        {error && (
          <div className="px-3 py-2 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Daily embedding job"
          className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this job does..."
          rows={2}
          className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
        />
      </div>

      {/* Source Identifier */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Source Identifier *
        </label>
        <input
          type="text"
          value={sourceIdentifier}
          onChange={(e) => setSourceIdentifier(e.target.value)}
          placeholder="cron-service-1, analytics-vm, etc."
          className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-text-muted mt-1">
          Identifies the service or VM running this job
        </p>
      </div>

      {/* Cron Expression */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Cron Expression *
        </label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => setCronExpression(e.target.value)}
          placeholder="0 * * * *"
          className={`w-full px-3 py-2 bg-surface-overlay border rounded-lg text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 ${
            cronExpression && !cronValid
              ? "border-danger focus:ring-danger"
              : "border-border focus:ring-accent"
          }`}
        />
        {cronValid ? (
          <p className="text-xs text-success mt-1">{cronDesc}</p>
        ) : cronExpression ? (
          <p className="text-xs text-danger mt-1">Invalid cron expression</p>
        ) : null}
      </div>

      {/* Next runs preview */}
      {nextRuns.length > 0 && (
        <div className="bg-surface-overlay rounded-lg p-3">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
            Next 5 executions
          </p>
          <ul className="space-y-1">
            {nextRuns.map((run, i) => (
              <li key={i} className="text-xs text-text-secondary font-mono">
                {run.start.toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="UTC">UTC</option>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Chicago">America/Chicago</option>
          <option value="America/Denver">America/Denver</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Europe/London">Europe/London</option>
          <option value="Europe/Paris">Europe/Paris</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
          <option value="Asia/Shanghai">Asia/Shanghai</option>
        </select>
      </div>

      {/* Target Model */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Target Model *
        </label>
        {models.length > 0 ? (
          <select
            value={targetModel}
            onChange={(e) => setTargetModel(e.target.value)}
            className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select a model...</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={targetModel}
            onChange={(e) => setTargetModel(e.target.value)}
            placeholder="llama3:8b"
            className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        )}
      </div>

      {/* Preferred Server */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Preferred Server (optional)
        </label>
        <select
          value={preferredServerId ?? ""}
          onChange={(e) =>
            setPreferredServerId(e.target.value ? parseInt(e.target.value) : null)
          }
          className="w-full px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Auto (proxy decides)</option>
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>
      </div>

      {/* Expected Duration */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Expected Duration
        </label>
        <div className="flex gap-2">
          <select
            value={
              DURATION_PRESETS.some((p) => p.value === expectedDurationMs)
                ? expectedDurationMs
                : "custom"
            }
            onChange={(e) => handleDurationChange(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {DURATION_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom...</option>
          </select>
          {!DURATION_PRESETS.some((p) => p.value === expectedDurationMs) && (
            <input
              type="number"
              value={customDuration || Math.round(expectedDurationMs / 60000)}
              onChange={(e) => handleCustomDurationChange(e.target.value)}
              placeholder="minutes"
              min={1}
              className="w-24 px-3 py-2 bg-surface-overlay border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          )}
        </div>
        <p className="text-xs text-text-muted mt-1">
          Used for conflict detection
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm bg-surface-overlay border border-border rounded-lg hover:bg-surface-overlay/80 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : job ? "Update Job" : "Create Job"}
        </button>
      </div>
    </form>
  );
}
