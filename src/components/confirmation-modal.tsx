"use client";

import { useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  warning?: string;
  requireAcknowledge?: boolean;
  acknowledgeLabel?: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "accent";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  description,
  warning,
  requireAcknowledge = false,
  acknowledgeLabel = "I understand this model cannot be re-downloaded",
  confirmLabel = "Confirm",
  confirmVariant = "accent",
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const canConfirm = !requireAcknowledge || acknowledged;
  const confirmClass =
    confirmVariant === "danger"
      ? "bg-red-600 hover:bg-red-500 disabled:bg-red-800"
      : "bg-accent hover:bg-accent/90 disabled:bg-accent/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-surface-raised border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {title}
        </h3>
        <p className="text-sm text-text-secondary mb-4">{description}</p>

        {warning && (
          <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{warning}</p>
          </div>
        )}

        {requireAcknowledge && (
          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span className="text-sm text-text-secondary">
              {acknowledgeLabel}
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setAcknowledged(false);
              onCancel();
            }}
            className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setAcknowledged(false);
              onConfirm();
            }}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
