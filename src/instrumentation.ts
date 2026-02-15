export async function register() {
  // Only run on the server side
  if (typeof window !== "undefined") return;

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("./lib/db");

  // Run migrations before starting poller
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied");

  // Seed admin user from env vars if no users exist
  const { users, userTelegramConfigs, userServerSubscriptions, servers } = await import("./lib/schema");
  const existingUsers = await db.select({ id: users.id }).from(users).limit(1);

  if (existingUsers.length === 0) {
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (adminUser && adminPass) {
      const { hashPassword, generateApiKey } = await import("./lib/auth");
      const [user] = await db.insert(users).values({
        username: adminUser.toLowerCase().trim(),
        passwordHash: await hashPassword(adminPass),
        isAdmin: true,
        apiKey: generateApiKey(),
      }).returning();
      console.log("[Setup] Admin user created:", adminUser);

      // If global Telegram is configured, set up the admin user's Telegram config
      const tgToken = process.env.TELEGRAM_BOT_TOKEN;
      const tgChat = process.env.TELEGRAM_CHAT_ID;
      if (tgToken && tgChat) {
        await db.insert(userTelegramConfigs).values({
          userId: user.id,
          botToken: tgToken,
          chatId: tgChat,
          isEnabled: true,
        });
        console.log("[Setup] Admin Telegram config seeded from env vars");

        // Subscribe admin to all servers
        const allServers = await db.select({ id: servers.id }).from(servers);
        if (allServers.length > 0) {
          await db.insert(userServerSubscriptions).values(
            allServers.map((s) => ({
              userId: user.id,
              serverId: s.id,
              notifyOffline: true,
              notifyOnline: true,
              notifyReboot: true,
            }))
          );
          console.log("[Setup] Admin subscribed to all servers");
        }
      }
    }
  }

  const { startPoller } = await import("./lib/poller");
  await startPoller();

  const { startTelegramBot } = await import("./lib/telegram-bot");
  await startTelegramBot();

  // Clean expired sessions every hour
  const { deleteExpiredSessions } = await import("./lib/auth");
  setInterval(deleteExpiredSessions, 60 * 60 * 1000);
}
