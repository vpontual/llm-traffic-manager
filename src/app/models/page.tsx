"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/use-auth";
import {
  ModelRecommendations,
  type RecommendationsResponse,
} from "@/components/model-recommendations";
import { ManagementActionsLog } from "@/components/management-actions-log";
import { ConfirmationModal } from "@/components/confirmation-modal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ServerInfo {
  id: number;
  name: string;
}

interface ModalState {
  type: "pull" | "delete";
  modelName: string;
  serverId: number;
  serverName: string;
  isCustom?: boolean;
}

export default function ModelsPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  const { data: recommendations } = useSWR<RecommendationsResponse>(
    "/api/recommendations?hours=168",
    fetcher,
    { refreshInterval: 30_000 }
  );

  const { data: fleetSettings } = useSWR<Record<string, unknown>>(
    "/api/settings/fleet",
    fetcher
  );

  const { data: servers } = useSWR<ServerInfo[]>("/api/servers", fetcher);

  const { data: actions, mutate: mutateActions } = useSWR(
    isAdmin ? "/api/models/actions?limit=50" : null,
    fetcher,
    { refreshInterval: 5_000 }
  );

  const [modal, setModal] = useState<ModalState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const managementEnabled =
    (fleetSettings?.intelligent_management_enabled as boolean) ?? false;

  const handleDelete = useCallback(
    async (modelName: string, serverId: number, serverName: string) => {
      // Check registry first to determine if custom
      const res = await fetch(
        `/api/models/registry-check?model=${encodeURIComponent(modelName)}`
      );
      const check = await res.json();
      setModal({
        type: "delete",
        modelName,
        serverId,
        serverName,
        isCustom: check.isCustom,
      });
    },
    []
  );

  const handlePull = useCallback(
    (modelName: string, serverId: number, serverName: string) => {
      setModal({ type: "pull", modelName, serverId, serverName });
    },
    []
  );

  const executeAction = useCallback(async () => {
    if (!modal) return;
    setActionLoading(true);

    const endpoint =
      modal.type === "pull" ? "/api/models/pull" : "/api/models/delete";
    const body: Record<string, unknown> = {
      modelName: modal.modelName,
      serverId: modal.serverId,
    };
    if (modal.type === "delete" && modal.isCustom) {
      body.acknowledgeCustom = true;
    }

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setActionLoading(false);
    setModal(null);
    mutateActions();
  }, [modal, mutateActions]);

  if (!recommendations) {
    return (
      <div id="main-content" className="max-w-[1440px] mx-auto px-4 py-6">
        <div className="text-text-muted">Loading recommendations...</div>
      </div>
    );
  }

  return (
    <div id="main-content" className="max-w-[1440px] mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Models</h1>
        <p className="text-sm text-text-muted mt-1">
          Fleet model recommendations based on the last{" "}
          {recommendations.periodHours} hours of usage data
          {managementEnabled && isAdmin && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/15 text-accent">
              Management enabled
            </span>
          )}
        </p>
      </div>

      <ModelRecommendations
        data={recommendations}
        managementEnabled={managementEnabled}
        isAdmin={isAdmin}
        servers={servers ?? []}
        onDelete={handleDelete}
        onPull={handlePull}
      />

      {isAdmin && actions && actions.length > 0 && (
        <div className="mt-6">
          <ManagementActionsLog actions={actions} />
        </div>
      )}

      <ConfirmationModal
        isOpen={modal !== null}
        title={
          modal?.type === "delete"
            ? `Delete ${modal.modelName}?`
            : `Pull ${modal?.modelName ?? ""}?`
        }
        description={
          modal?.type === "delete"
            ? `This will remove ${modal.modelName} from ${modal.serverName}. The model will need to be re-pulled to use it on this server again.`
            : `This will pull ${modal?.modelName ?? ""} to ${modal?.serverName ?? ""}. Large models may take several minutes to download.`
        }
        warning={
          modal?.type === "delete" && modal?.isCustom
            ? "This appears to be a custom model (not found on Ollama registry or HuggingFace). Deleting it means it cannot be re-downloaded from any registry."
            : undefined
        }
        requireAcknowledge={modal?.type === "delete" && modal?.isCustom === true}
        confirmLabel={
          actionLoading
            ? "Processing..."
            : modal?.type === "delete"
              ? "Delete"
              : "Pull"
        }
        confirmVariant={modal?.type === "delete" ? "danger" : "accent"}
        onConfirm={executeAction}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
