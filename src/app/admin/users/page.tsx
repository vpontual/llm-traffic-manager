"use client";

// Admin users page -- create/manage users (admin only)

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { data: userList, mutate } = useSWR<User[]>("/api/users", fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin: newIsAdmin }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create user");
      return;
    }

    setNewUsername("");
    setNewPassword("");
    setNewIsAdmin(false);
    setShowCreate(false);
    mutate();
  }

  async function handleDelete(userId: number) {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    await fetch("/api/users/" + userId, { method: "DELETE" });
    mutate();
  }

  async function handleToggleAdmin(userId: number, currentlyAdmin: boolean) {
    await fetch("/api/users/" + userId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: !currentlyAdmin }),
    });
    mutate();
  }

  if (!currentUser?.isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-text-muted">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
          <p className="text-sm text-text-muted mt-1">{userList?.length ?? 0} users</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showCreate ? "Cancel" : "Add User"}
          </button>
          <Link
            href="/"
            className="px-3 py-1.5 text-sm bg-surface-raised border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-raised border border-border rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                required
                minLength={4}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isAdmin"
              checked={newIsAdmin}
              onChange={(e) => setNewIsAdmin(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isAdmin" className="text-sm text-text-secondary">Admin</label>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 transition-colors"
          >
            Create User
          </button>
        </form>
      )}

      <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-text-muted font-medium">Username</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium">Role</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium">Created</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {userList?.map((u) => (
              <tr key={u.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 text-text-primary font-medium">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={u.isAdmin ? "text-accent" : "text-text-muted"}>
                    {u.isAdmin ? "Admin" : "User"}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {u.id !== currentUser?.id && (
                    <>
                      <button
                        onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                        className="text-text-secondary hover:text-text-primary text-xs"
                      >
                        {u.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {u.id === currentUser?.id && (
                    <span className="text-text-muted text-xs">You</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
