// Ollama API response types

export interface OllamaModelDetails {
  parent_model: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
  expires_at: string;
  size_vram: number;
  context_length: number;
}

export interface OllamaAvailableModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaPsResponse {
  models: OllamaRunningModel[];
}

export interface OllamaTagsResponse {
  models: OllamaAvailableModel[];
}

export interface OllamaVersionResponse {
  version: string;
}

// Server config from env
export interface ServerConfig {
  name: string;
  host: string;
  ramGb: number;
}

// System metrics from fleet metrics agent
export interface SystemMetrics {
  cpuTempC: number | null;
  gpuTempC: number | null;
  cpuPercent: number | null;
  gpuPercent: number | null;
  memTotalMb: number;
  memUsedMb: number;
  memAvailableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
  loadAvg: [number, number, number];
  uptimeSeconds: number;
  diskTotalGb: number;
  diskUsedGb: number;
  recentBoots: string[];
}

// Dashboard API response types
export interface ServerState {
  id: number;
  name: string;
  host: string;
  totalRamGb: number;
  isOnline: boolean;
  ollamaVersion: string | null;
  loadedModels: OllamaRunningModel[];
  availableModels: OllamaAvailableModel[];
  totalVramUsed: number;
  polledAt: string | null;
  modelLoadTimes?: Record<string, string>;
  systemMetrics?: SystemMetrics | null;
}

export interface ModelEvent {
  id: number;
  serverId: number;
  serverName: string;
  modelName: string;
  eventType: "loaded" | "unloaded";
  modelSize: number;
  vramSize: number;
  parameterSize: string | null;
  quantization: string | null;
  occurredAt: string;
}

// Scheduled Jobs types

export interface ScheduledJob {
  id: number;
  name: string;
  description: string | null;
  sourceIdentifier: string;
  cronExpression: string;
  timezone: string;
  targetModel: string;
  preferredServerId: number | null;
  preferredServerName: string | null;
  expectedDurationMs: number;
  isEnabled: boolean;
  nextExecutions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledExecution {
  jobId: number;
  jobName: string;
  sourceIdentifier: string;
  targetModel: string;
  startTime: string;
  endTime: string;
  isConflict: boolean;
}

export interface ConflictGroup {
  startTime: string;
  endTime: string;
  jobs: Array<{
    jobId: number;
    jobName: string;
    targetModel: string;
  }>;
  conflictType: "same_model" | "time_overlap";
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  durationMs: number;
}
