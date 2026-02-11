CREATE TABLE "request_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_ip" text NOT NULL,
	"model" text,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"target_server_id" integer,
	"target_host" text,
	"status_code" integer,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_target_server_id_servers_id_fk" FOREIGN KEY ("target_server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;