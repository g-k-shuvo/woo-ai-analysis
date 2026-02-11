/**
 * Chat Service — orchestrates the full AI query pipeline.
 *
 * Flow: question → AI pipeline (NL→SQL) → query executor → chart spec → response
 *
 * This is the main entry point for chat queries. It wires together:
 * - AIQueryPipeline (NL→SQL conversion + validation)
 * - QueryExecutor (read-only SQL execution)
 * - toChartConfig (chart.js config generation)
 */

import type { AIQueryPipeline } from '../ai/pipeline.js';
import type { QueryExecutor } from '../ai/queryExecutor.js';
import { toChartConfig } from '../ai/chartSpec.js';
import type { ChartSpecResult } from '../ai/types.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ChatServiceDeps {
  aiPipeline: AIQueryPipeline;
  queryExecutor: QueryExecutor;
}

export interface ChatResponse {
  answer: string;
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  chartSpec: ChatSpecSummary | null;
  chartConfig: ChartSpecResult | null;
}

export interface ChatSpecSummary {
  type: string;
  title: string;
}

export function createChatService(deps: ChatServiceDeps) {
  const { aiPipeline, queryExecutor } = deps;

  async function ask(storeId: string, question: string): Promise<ChatResponse> {
    if (!question || !question.trim()) {
      throw new ValidationError('Question cannot be empty');
    }

    logger.info({ storeId, questionLength: question.trim().length }, 'Chat service: processing question');

    // Step 1: Convert question to validated SQL via AI pipeline
    const queryResult = await aiPipeline.processQuestion(storeId, question);

    // Step 2: Execute the validated SQL
    const executionResult = await queryExecutor.execute(queryResult);

    // Step 3: Generate chart config from results (if chart spec provided)
    const chartConfig = toChartConfig(queryResult.chartSpec, executionResult.rows);

    // Build chart spec summary for the response
    const chartSpecSummary: ChatSpecSummary | null = queryResult.chartSpec
      ? { type: queryResult.chartSpec.type, title: queryResult.chartSpec.title }
      : null;

    const response: ChatResponse = {
      answer: queryResult.explanation,
      sql: queryResult.sql,
      rows: executionResult.rows,
      rowCount: executionResult.rowCount,
      durationMs: executionResult.durationMs,
      chartSpec: chartSpecSummary,
      chartConfig,
    };

    logger.info(
      {
        storeId,
        rowCount: response.rowCount,
        durationMs: response.durationMs,
        hasChart: chartConfig !== null,
      },
      'Chat service: question answered',
    );

    return response;
  }

  return { ask };
}

export type ChatService = ReturnType<typeof createChatService>;
