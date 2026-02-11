CREATE TABLE "system_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"cpu_temp_c" integer,
	"gpu_temp_c" integer,
	"mem_total_mb" integer,
	"mem_used_mb" integer,
	"mem_available_mb" integer,
	"swap_total_mb" integer,
	"swap_used_mb" integer,
	"load_avg_1" integer,
	"load_avg_5" integer,
	"load_avg_15" integer,
	"uptime_seconds" integer,
	"disk_total_gb" integer,
	"disk_used_gb" integer,
	"recent_boots" jsonb DEFAULT '[]'::jsonb,
	"polled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_metrics" ADD CONSTRAINT "system_metrics_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;