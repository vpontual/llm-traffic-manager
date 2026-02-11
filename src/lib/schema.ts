import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull().unique(),
  totalRamGb: integer("total_ram_gb").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serverSnapshots = pgTable("server_snapshots", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .references(() => servers.id)
    .notNull(),
  isOnline: boolean("is_online").notNull(),
  ollamaVersion: text("ollama_version"),
  loadedModels: jsonb("loaded_models").$type<unknown[]>().default([]),
  availableModels: jsonb("available_models").$type<unknown[]>().default([]),
  totalVramUsed: bigint("total_vram_used", { mode: "number" }).default(0),
  polledAt: timestamp("polled_at").defaultNow().notNull(),
});

export const modelEvents = pgTable("model_events", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .references(() => servers.id)
    .notNull(),
  modelName: text("model_name").notNull(),
  eventType: text("event_type").notNull(), // "loaded" | "unloaded"
  modelSize: bigint("model_size", { mode: "number" }).default(0),
  vramSize: bigint("vram_size", { mode: "number" }).default(0),
  parameterSize: text("parameter_size"),
  quantization: text("quantization"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .references(() => servers.id)
    .notNull(),
  cpuTempC: integer("cpu_temp_c"),
  gpuTempC: integer("gpu_temp_c"),
  memTotalMb: integer("mem_total_mb"),
  memUsedMb: integer("mem_used_mb"),
  memAvailableMb: integer("mem_available_mb"),
  swapTotalMb: integer("swap_total_mb"),
  swapUsedMb: integer("swap_used_mb"),
  loadAvg1: integer("load_avg_1"), // value * 100
  loadAvg5: integer("load_avg_5"),
  loadAvg15: integer("load_avg_15"),
  uptimeSeconds: integer("uptime_seconds"),
  diskTotalGb: integer("disk_total_gb"),
  diskUsedGb: integer("disk_used_gb"),
  recentBoots: jsonb("recent_boots").$type<string[]>().default([]),
  polledAt: timestamp("polled_at").defaultNow().notNull(),
});

export const requestLogs = pgTable("request_logs", {
  id: serial("id").primaryKey(),
  sourceIp: text("source_ip").notNull(),
  model: text("model"),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  targetServerId: integer("target_server_id").references(() => servers.id),
  targetHost: text("target_host"),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
