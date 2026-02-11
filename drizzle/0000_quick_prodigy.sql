CREATE TABLE "model_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"model_name" text NOT NULL,
	"event_type" text NOT NULL,
	"model_size" bigint DEFAULT 0,
	"vram_size" bigint DEFAULT 0,
	"parameter_size" text,
	"quantization" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"is_online" boolean NOT NULL,
	"ollama_version" text,
	"loaded_models" jsonb DEFAULT '[]'::jsonb,
	"available_models" jsonb DEFAULT '[]'::jsonb,
	"total_vram_used" bigint DEFAULT 0,
	"polled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"total_ram_gb" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "servers_host_unique" UNIQUE("host")
);
--> statement-breakpoint
ALTER TABLE "model_events" ADD CONSTRAINT "model_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_snapshots" ADD CONSTRAINT "server_snapshots_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;