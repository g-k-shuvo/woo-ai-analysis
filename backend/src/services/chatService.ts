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
import type { ChartRenderer } from './chartRenderer.js';
import { toChartConfig } from '../ai/chartSpec.js';
import type { ChartMeta, ChartSpecResult } from '../ai/types.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ChatServiceDeps {
  aiPipeline: AIQueryPipeline;
  queryExecutor: QueryExecutor;
  chartRenderer?: ChartRenderer;
}

export interface ChatResponse {
  answer: string;
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  chartSpec: ChatSpecSummary | null;
  chartConfig: ChartSpecResult | null;
  chartImage: string | null;
  chartMeta: ChartMeta | null;
}

export interface ChatSpecSummary {
  type: string;
  title: string;
}

export interface SuggestionsResponse {
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS: string[] = [
  'What was my total revenue this month?',
  'What are my top 5 selling products?',
  'How many new customers did I get this week?',
  'What is my average order value?',
  'Show revenue trend for the last 30 days',
  'Which product categories perform best?',
];

export function createChatService(deps: ChatServiceDeps) {
  const { aiPipeline, queryExecutor, chartRenderer } = deps;

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

    // Step 4: Render chart to PNG data URI (if chart config and renderer available)
    let chartImage: string | null = null;
    if (chartConfig && chartRenderer) {
      chartImage = await chartRenderer.renderToDataURI(chartConfig);
    }

    // Build chart spec summary for the response
    const chartSpecSummary: ChatSpecSummary | null = queryResult.chartSpec
      ? { type: queryResult.chartSpec.type, title: queryResult.chartSpec.title }
      : null;

    // Build chart meta for frontend chart type switching
    const chartMeta: ChartMeta | null = queryResult.chartSpec
      ? {
          dataKey: queryResult.chartSpec.dataKey,
          labelKey: queryResult.chartSpec.labelKey,
          xLabel: queryResult.chartSpec.xLabel,
          yLabel: queryResult.chartSpec.yLabel,
        }
      : null;

    const response: ChatResponse = {
      answer: queryResult.explanation,
      sql: queryResult.sql,
      rows: executionResult.rows,
      rowCount: executionResult.rowCount,
      durationMs: executionResult.durationMs,
      chartSpec: chartSpecSummary,
      chartConfig,
      chartImage,
      chartMeta,
    };

    logger.info(
      {
        storeId,
        rowCount: response.rowCount,
        durationMs: response.durationMs,
        hasChart: chartConfig !== null,
        hasChartImage: chartImage !== null,
      },
      'Chat service: question answered',
    );

    return response;
  }

  function getSuggestions(): SuggestionsResponse {
    return { suggestions: [...DEFAULT_SUGGESTIONS] };
  }

  return { ask, getSuggestions };
}

export type ChatService = ReturnType<typeof createChatService>;

export { DEFAULT_SUGGESTIONS };
