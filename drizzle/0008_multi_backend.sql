ALTER TABLE "servers" ADD COLUMN "backend_type" text DEFAULT 'ollama' NOT NULL;
ALTER TABLE "servers" ADD COLUMN "max_concurrent" integer DEFAULT 1 NOT NULL;
ALTER TABLE "servers" ADD COLUMN "is_disabled" boolean DEFAULT false NOT NULL;
