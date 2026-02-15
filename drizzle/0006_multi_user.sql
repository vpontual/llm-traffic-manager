CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "api_key" text NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_telegram_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "bot_token" text NOT NULL,
  "chat_id" text NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_server_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "server_id" integer NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "notify_offline" boolean DEFAULT true NOT NULL,
  "notify_online" boolean DEFAULT true NOT NULL,
  "notify_reboot" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id");
