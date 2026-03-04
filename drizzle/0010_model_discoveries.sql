CREATE TABLE IF NOT EXISTS "model_discoveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "model_name" text NOT NULL UNIQUE,
  "model_family" text,
  "families" jsonb DEFAULT '[]'::jsonb,
  "parameter_size" text,
  "quantization" text,
  "model_size" bigint DEFAULT 0,
  "description" text,
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "pull_count" text,
  "registry_exists" boolean,
  "first_seen_server_name" text NOT NULL,
  "info_fetch_status" text DEFAULT 'pending' NOT NULL,
  "info_fetched_at" timestamp,
  "discovered_at" timestamp DEFAULT now() NOT NULL
);
