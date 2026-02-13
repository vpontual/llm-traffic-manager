"use client";

interface ModelRecommendation {
  modelName: string;
  serverName: string;
  serverId: number;
  loadCount: number;
  unloadCount: number;
  requestCount: number;
  churnScore: number;
  availableOn: string[];
  totalServers: number;
}

export interface RecommendationsResponse {
  considerRemoving: ModelRecommendation[];
  considerAdding: ModelRecommendation[];
  periodHours: number;
  serverNames: string[];
}

export function ModelRecommendations({
  data,
}: {
  data: RecommendationsResponse;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Consider Removing */}
      <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning" />
            <h3 className="font-semibold text-text-primary">
              Consider Removing
            </h3>
          </div>
          <p className="text-xs text-text-muted mt-1">
            High load/unload churn with few proxy requests
          </p>
        </div>
        {data.considerRemoving.length === 0 ? (
          <div className="p-4 text-sm text-text-muted flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            No churn issues detected
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-raised">
                <tr className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
                  <th className="text-left p-3 pl-4">Model</th>
                  <th className="text-left p-3">Server</th>
                  <th className="text-right p-3">Loads</th>
                  <th className="text-right p-3">Reqs</th>
                  <th className="text-right p-3 pr-4">Also On</th>
                </tr>
              </thead>
              <tbody>
                {data.considerRemoving.map((rec, i) => {
                  const otherServers = rec.availableOn.filter(
                    (s) => s !== rec.serverName
                  );
                  return (
                    <tr
                      key={i}
                      className="border-t border-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="p-3 pl-4 font-mono text-text-primary truncate max-w-[180px]">
                        {rec.modelName}
                      </td>
                      <td className="p-3 text-text-secondary whitespace-nowrap">
                        {rec.serverName}
                      </td>
                      <td className="p-3 text-right text-warning font-semibold">
                        {rec.loadCount}
                      </td>
                      <td className="p-3 text-right text-text-muted">
                        {rec.requestCount}
                      </td>
                      <td className="p-3 pr-4 text-right">
                        {otherServers.length > 0 ? (
                          <span className="text-xs text-success">
                            {otherServers.join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-danger">Only here</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Consider Adding */}
      <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <h3 className="font-semibold text-text-primary">
              Consider Adding to All Servers
            </h3>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Popular models only available on some servers
          </p>
        </div>
        {data.considerAdding.length === 0 ? (
          <div className="p-4 text-sm text-text-muted flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            All popular models are on every server
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-raised">
                <tr className="text-xs text-text-muted uppercase tracking-wide border-b border-border">
                  <th className="text-left p-3 pl-4">Model</th>
                  <th className="text-right p-3">Requests</th>
                  <th className="text-left p-3">Available On</th>
                  <th className="text-left p-3 pr-4">Missing From</th>
                </tr>
              </thead>
              <tbody>
                {data.considerAdding.map((rec, i) => {
                  const missingFrom = data.serverNames.filter(
                    (s) => !rec.availableOn.includes(s)
                  );
                  return (
                    <tr
                      key={i}
                      className="border-t border-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="p-3 pl-4 font-mono text-text-primary truncate max-w-[180px]">
                        {rec.modelName}
                      </td>
                      <td className="p-3 text-right text-accent font-semibold">
                        {rec.requestCount}
                      </td>
                      <td className="p-3 text-xs text-text-secondary">
                        {rec.availableOn.join(", ")}
                      </td>
                      <td className="p-3 pr-4 text-xs text-warning">
                        {missingFrom.join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
