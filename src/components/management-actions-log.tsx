"use client";

interface ManagementAction {
  id: number;
  action: string;
  modelName: string;
  serverName: string;
  status: string;
  detail: string | null;
  triggeredBy: string;
  createdAt: string;
}

export function ManagementActionsLog({
  actions,
}: {
  actions: ManagementAction[];
}) {
  if (actions.length === 0) {
    return (
      <div className="bg-surface-raised border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text-primary mb-2">
          Management Actions
        </h3>
        <p className="text-sm text-text-muted">No actions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-text-primary">Management Actions</h3>
        <p className="text-xs text-text-muted mt-1">
          Audit trail of model pull and delete operations
        </p>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
              <th className="text-left p-3 pl-4">Time</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Model</th>
              <th className="text-left p-3">Server</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3 pr-4">By</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr
                key={a.id}
                className="border-t border-border/50 hover:bg-surface-overlay/30"
              >
                <td className="p-3 pl-4 text-text-muted whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleString()}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      a.action === "pull"
                        ? "bg-accent/15 text-accent"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {a.action}
                  </span>
                </td>
                <td className="p-3 font-mono text-text-primary truncate max-w-[200px]">
                  {a.modelName}
                </td>
                <td className="p-3 text-text-secondary whitespace-nowrap">
                  {a.serverName}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      a.status === "success"
                        ? "bg-green-500/15 text-green-400"
                        : a.status === "pending"
                          ? "bg-accent/15 text-accent"
                          : "bg-red-500/15 text-red-400"
                    }`}
                    title={a.detail ?? undefined}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="p-3 pr-4 text-text-secondary">{a.triggeredBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
