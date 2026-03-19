-- Performance indexes for time-series tables
-- Without these, every dashboard query and router refresh does full table scans.

CREATE INDEX IF NOT EXISTS idx_server_snapshots_server_polled ON server_snapshots(server_id, polled_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model_created ON request_logs(model, created_at);
CREATE INDEX IF NOT EXISTS idx_model_events_occurred ON model_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_model_events_server_occurred ON model_events(server_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_server_polled ON system_metrics(server_id, polled_at);
CREATE INDEX IF NOT EXISTS idx_server_events_occurred ON server_events(occurred_at);
