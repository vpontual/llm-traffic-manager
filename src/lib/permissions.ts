// Access control helpers: pure permission checks

export function isSelfOrAdmin(
  user: { id: number; isAdmin: boolean },
  targetId: number
): boolean {
  return user.isAdmin || user.id === targetId;
}
