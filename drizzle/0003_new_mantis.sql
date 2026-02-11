ALTER TABLE "system_metrics" ADD COLUMN IF NOT EXISTS "cpu_percent" integer;--> statement-breakpoint
ALTER TABLE "system_metrics" ADD COLUMN IF NOT EXISTS "gpu_percent" integer;