"use client";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function VramBar({
  used,
  totalGb,
}: {
  used: number; // bytes
  totalGb: number;
}) {
  const totalBytes = totalGb * 1024 * 1024 * 1024;
  const pct = totalBytes > 0 ? Math.min((used / totalBytes) * 100, 100) : 0;

  let barColor = "bg-accent";
  if (pct > 80) barColor = "bg-danger";
  else if (pct > 60) barColor = "bg-warning";

  return (
    <div>
      <div className="flex justify-between text-xs text-text-secondary mb-1">
        <span>VRAM</span>
        <span>
          {formatBytes(used)} / {totalGb} GB
        </span>
      </div>
      <div className="h-2.5 bg-surface-overlay rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
