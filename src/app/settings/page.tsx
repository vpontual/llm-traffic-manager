"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TelegramConfig {
  botToken: string;
  chatId: string;
  isEnabled: boolean;
}

interface ServerInfo {
  id: number;
  name: string;
  isOnline: boolean;
}

interface Subscription {
  serverId: number;
  serverName: string;
  notifyOffline: boolean;
  notifyOnline: boolean;
  notifyReboot: boolean;
}

export default function SettingsPage() {
  const { user, mutate: mutateAuth } = useAuth();

  // --- Account ---
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords do not match");
      return;
    }
    const res = await fetch("/api/users/" + user?.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setPasswordMsg("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPasswordMsg("Failed to update password");
    }
  }

  async function handleRegenApiKey() {
    if (!confirm("Regenerate API key? The old key will stop working.")) return;
    const res = await fetch("/api/users/" + user?.id + "/api-key", { method: "POST" });
    if (res.ok) {
      mutateAuth();
    }
  }

  // --- Telegram ---
  const { data: tgConfig, mutate: mutateTg } = useSWR<TelegramConfig | null>(
    "/api/settings/telegram",
    fetcher
  );
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [tgEnabled, setTgEnabled] = useState(true);
  const [tgMsg, setTgMsg] = useState("");
  const [tgLoading, setTgLoading] = useState(false);

  useEffect(() => {
    if (tgConfig) {
      setBotToken(tgConfig.botToken);
      setChatId(tgConfig.chatId);
      setTgEnabled(tgConfig.isEnabled);
    }
  }, [tgConfig]);

  async function handleSaveTelegram(e: React.FormEvent) {
    e.preventDefault();
    setTgMsg("");
    setTgLoading(true);
    const res = await fetch("/api/settings/telegram", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken, chatId, isEnabled: tgEnabled }),
    });
    setTgLoading(false);
    if (res.ok) {
      setTgMsg("Saved! Check Telegram for a test message.");
      mutateTg();
    } else {
      const data = await res.json();
      setTgMsg(data.error || "Failed to save");
    }
  }

  async function handleRemoveTelegram() {
    await fetch("/api/settings/telegram", { method: "DELETE" });
    setBotToken("");
    setChatId("");
    setTgMsg("");
    mutateTg();
  }

  // --- Subscriptions ---
  const { data: serverList } = useSWR<ServerInfo[]>("/api/servers", fetcher);
  const { data: subs, mutate: mutateSubs } = useSWR<Subscription[]>(
    "/api/settings/subscriptions",
    fetcher
  );
  const [subState, setSubState] = useState<
    Record<number, { offline: boolean; online: boolean; reboot: boolean }>
  >({});
  const [subsMsg, setSubsMsg] = useState("");

  useEffect(() => {
    if (serverList && subs) {
      const state: typeof subState = {};
      for (const server of serverList) {
        const sub = subs.find((s) => s.serverId === server.id);
        state[server.id] = {
          offline: sub?.notifyOffline ?? false,
          online: sub?.notifyOnline ?? false,
          reboot: sub?.notifyReboot ?? false,
        };
      }
      setSubState(state);
    }
  }, [serverList, subs]);

  function toggleSub(serverId: number, type: "offline" | "online" | "reboot") {
    setSubState((prev) => ({
      ...prev,
      [serverId]: {
        ...prev[serverId],
        [type]: !prev[serverId]?.[type],
      },
    }));
  }

  function toggleAllServer(serverId: number) {
    const current = subState[serverId];
    const allOn = current?.offline && current?.online && current?.reboot;
    setSubState((prev) => ({
      ...prev,
      [serverId]: { offline: !allOn, online: !allOn, reboot: !allOn },
    }));
  }

  async function handleSaveSubs() {
    setSubsMsg("");
    const payload = Object.entries(subState)
      .filter(([, v]) => v.offline || v.online || v.reboot)
      .map(([serverId, v]) => ({
        serverId: parseInt(serverId),
        notifyOffline: v.offline,
        notifyOnline: v.online,
        notifyReboot: v.reboot,
      }));

    const res = await fetch("/api/settings/subscriptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setSubsMsg("Subscriptions saved");
      mutateSubs();
    } else {
      setSubsMsg("Failed to save");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <Link
          href="/"
          className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
        >
          Dashboard
        </Link>
      </div>

      {/* Account Section */}
      <section className="bg-surface-raised border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Account</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Username</label>
            <p className="text-text-primary">{user?.username}</p>
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text-secondary text-sm font-mono overflow-hidden">
                {showApiKey ? user?.apiKey : "••••••••••••••••"}
              </code>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-3 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              >
                {showApiKey ? "Hide" : "Show"}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(user?.apiKey || "")}
                className="px-3 py-2 text-sm border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleRegenApiKey}
                className="px-3 py-2 text-sm border border-red-800 rounded-lg text-red-400 hover:text-red-300 transition-colors"
              >
                Regenerate
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Use header <code className="text-text-secondary">X-Ollama-Api-Key</code> to identify proxy requests as you.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3 pt-2 border-t border-border">
            <label className="block text-sm text-text-muted">Change Password</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                minLength={4}
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                required
              />
            </div>
            {passwordMsg && (
              <p className={`text-sm ${passwordMsg.includes("updated") ? "text-green-400" : "text-red-400"}`}>
                {passwordMsg}
              </p>
            )}
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              Update Password
            </button>
          </form>
        </div>
      </section>

      {/* Telegram Section */}
      <section className="bg-surface-raised border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Telegram Notifications</h2>

        <form onSubmit={handleSaveTelegram} className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Bot Token</label>
            <input
              type="text"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Chat ID</label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="8330759296"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent font-mono"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tgEnabled"
              checked={tgEnabled}
              onChange={(e) => setTgEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="tgEnabled" className="text-sm text-text-secondary">
              Enable notifications
            </label>
          </div>

          {tgMsg && (
            <p className={`text-sm ${tgMsg.includes("Saved") ? "text-green-400" : "text-red-400"}`}>
              {tgMsg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={tgLoading}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {tgLoading ? "Validating..." : "Save & Test"}
            </button>
            {tgConfig && (
              <button
                type="button"
                onClick={handleRemoveTelegram}
                className="px-4 py-2 text-sm border border-red-800 rounded-lg text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Server Subscriptions */}
      <section className="bg-surface-raised border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Server Alert Subscriptions</h2>
        <p className="text-sm text-text-muted mb-4">
          Choose which server events trigger Telegram notifications for you.
        </p>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-2 text-text-muted font-medium">Server</th>
                <th className="text-center px-4 py-2 text-text-muted font-medium">All</th>
                <th className="text-center px-4 py-2 text-text-muted font-medium">Offline</th>
                <th className="text-center px-4 py-2 text-text-muted font-medium">Online</th>
                <th className="text-center px-4 py-2 text-text-muted font-medium">Reboot</th>
              </tr>
            </thead>
            <tbody>
              {serverList?.map((server) => {
                const s = subState[server.id] || { offline: false, online: false, reboot: false };
                const allOn = s.offline && s.online && s.reboot;
                return (
                  <tr key={server.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{server.name}</td>
                    <td className="text-center px-4 py-2">
                      <input
                        type="checkbox"
                        checked={allOn}
                        onChange={() => toggleAllServer(server.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="text-center px-4 py-2">
                      <input
                        type="checkbox"
                        checked={s.offline}
                        onChange={() => toggleSub(server.id, "offline")}
                        className="rounded"
                      />
                    </td>
                    <td className="text-center px-4 py-2">
                      <input
                        type="checkbox"
                        checked={s.online}
                        onChange={() => toggleSub(server.id, "online")}
                        className="rounded"
                      />
                    </td>
                    <td className="text-center px-4 py-2">
                      <input
                        type="checkbox"
                        checked={s.reboot}
                        onChange={() => toggleSub(server.id, "reboot")}
                        className="rounded"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {subsMsg && (
          <p className={`text-sm mt-3 ${subsMsg.includes("saved") ? "text-green-400" : "text-red-400"}`}>
            {subsMsg}
          </p>
        )}

        <button
          onClick={handleSaveSubs}
          className="mt-4 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
        >
          Save Subscriptions
        </button>
      </section>
    </div>
  );
}
