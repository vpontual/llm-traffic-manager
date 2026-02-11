export async function register() {
  // Only run on the server side
  if (typeof window !== "undefined") return;

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("./lib/db");

  // Run migrations before starting poller
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied");

  const { startPoller } = await import("./lib/poller");
  await startPoller();
}
