export interface EngineScanMetrics {
  scanId: string;
  filePath: string;
  language: string;
  fileSizeBytes: number;
  parseDurationMs: number;
  astGrepDurationMs: number;
  taintDurationMs: number;
  secretScanDurationMs: number;
  syntaxCheckDurationMs: number;
  totalDurationMs: number;
  findingsCount: number;
  secretsCount: number;
  syntaxErrorsCount: number;
}

export interface FindingTelemetryEvent {
  scanId: string;
  ruleId: string;
  cwe: string;
  severity: string;
  status: string;
  stepCount: number;
  hasSanitizers: boolean;
}

export interface LLMTriageTelemetryEvent {
  scanId: string;
  candidatePathId: string;
  model: string;
  latencyMs: number;
  inputTokenEstimate: number;
  resolvedStatus: string;
  success: boolean;
  error?: string;
}

export interface UIPerformanceMetrics {
  view: string;
  renderDurationMs: number;
  graphNodeCount?: number;
  graphEdgeCount?: number;
  interaction?: string;
}
