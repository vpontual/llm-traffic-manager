CREATE TABLE IF NOT EXISTS "model_pins" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_pattern" text NOT NULL,
	"server_id" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_pins_model_pattern_unique" UNIQUE("model_pattern")
);
--> statement-breakpoint
ALTER TABLE "model_pins" ADD CONSTRAINT "model_pins_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;
