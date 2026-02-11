/**
 * Shared types for the AI query pipeline.
 */

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'table';
  title: string;
  xLabel?: string;
  yLabel?: string;
  dataKey: string;
  labelKey: string;
}

export interface AIQueryResult {
  sql: string;
  params: string[];
  explanation: string;
  chartSpec: ChartSpec | null;
}

export interface SqlValidationResult {
  valid: boolean;
  sql: string;
  errors: string[];
}

export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
}

export interface OpenAIResponse {
  sql: string;
  explanation: string;
  chartSpec: ChartSpec | null;
}
