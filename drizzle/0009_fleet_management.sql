CREATE TABLE IF NOT EXISTS "fleet_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "management_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "model_name" text NOT NULL,
  "server_id" integer NOT NULL REFERENCES "servers"("id"),
  "server_name" text NOT NULL,
  "status" text NOT NULL,
  "detail" text,
  "triggered_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
