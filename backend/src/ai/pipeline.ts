/**
 * NL→SQL Pipeline — converts natural language questions into validated SQL queries.
 *
 * Flow: Question → System Prompt → OpenAI GPT-4o → JSON parse → SQL validation → Result
 */

import type { OpenAI } from 'openai';
import type { SchemaContextService } from './schemaContext.js';
import { buildSystemPrompt } from './prompts/system.js';
import { validateSql } from './sqlValidator.js';
import type { AIQueryResult, ChartSpec, OpenAIResponse } from './types.js';
import { AIError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OPENAI_MODEL = 'gpt-4o';
const OPENAI_MAX_TOKENS = 1024;
const OPENAI_TEMPERATURE = 0;
const OPENAI_TIMEOUT_MS = 30_000;
const MAX_QUESTION_LENGTH = 2000;

export interface PipelineDeps {
  openai: OpenAI;
  schemaContextService: SchemaContextService;
}

export function createAIQueryPipeline(deps: PipelineDeps) {
  const { openai, schemaContextService } = deps;

  async function processQuestion(
    storeId: string,
    question: string,
  ): Promise<AIQueryResult> {
    if (!storeId || !UUID_RE.test(storeId)) {
      throw new ValidationError('Invalid storeId: must be a valid UUID');
    }

    if (!question || !question.trim()) {
      throw new ValidationError('Question cannot be empty');
    }

    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      throw new ValidationError(
        `Question too long: ${trimmedQuestion.length} chars (max ${MAX_QUESTION_LENGTH})`,
      );
    }

    logger.info({ storeId, questionLength: trimmedQuestion.length }, 'AI pipeline: processing question');

    try {
      // Step 1: Get store context and build system prompt
      const storeContext = await schemaContextService.getStoreContext(storeId);
      const systemPrompt = buildSystemPrompt(storeContext);

      // Step 2: Call OpenAI with JSON response format and timeout
      let rawContent: string;
      try {
        const completion = await openai.chat.completions.create(
          {
            model: OPENAI_MODEL,
            temperature: OPENAI_TEMPERATURE,
            max_tokens: OPENAI_MAX_TOKENS,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: trimmedQuestion },
            ],
          },
          { timeout: OPENAI_TIMEOUT_MS },
        );

        const choice = completion.choices[0];
        if (!choice?.message?.content) {
          throw new AIError('OpenAI returned an empty response');
        }

        rawContent = choice.message.content;
      } catch (err) {
        if (err instanceof AIError) throw err;
        if (err instanceof ValidationError) throw err;

        throw new AIError('Failed to get response from OpenAI', {
          cause: err instanceof Error ? err : new Error(String(err)),
        });
      }

      // Step 3: Parse JSON response
      const parsed = parseOpenAIResponse(rawContent);

      // Step 4: Validate extracted SQL
      const validation = validateSql(parsed.sql);
      if (!validation.valid) {
        logger.warn(
          { storeId, errors: validation.errors, sqlPreview: parsed.sql.substring(0, 200) },
          'AI pipeline: SQL validation failed',
        );
        throw new AIError('Unable to process this question. Please try rephrasing.');
      }

      // Step 5: Build result with parameterized store_id
      const result: AIQueryResult = {
        sql: validation.sql,
        params: [storeId],
        explanation: parsed.explanation,
        chartSpec: parsed.chartSpec,
      };

      logger.info(
        { storeId, sqlLength: result.sql.length },
        'AI pipeline: query validated successfully',
      );

      return result;
    } catch (err) {
      if (err instanceof AIError) throw err;
      if (err instanceof ValidationError) throw err;

      throw new AIError('Pipeline failed unexpectedly', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return { processQuestion };
}

export type AIQueryPipeline = ReturnType<typeof createAIQueryPipeline>;

function parseOpenAIResponse(raw: string): OpenAIResponse {
  // Strip markdown code fences if present (```json ... ```, ```sql ... ```, etc.)
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AIError(
      'Failed to parse AI response as JSON. The AI returned invalid output.',
      { cause: err instanceof Error ? err : new Error(String(err)) },
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AIError('AI response is not a valid JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.sql !== 'string' || !obj.sql.trim()) {
    throw new AIError('AI response missing required "sql" field');
  }

  if (typeof obj.explanation !== 'string') {
    throw new AIError('AI response missing required "explanation" field');
  }

  const chartSpec = validateChartSpec(obj.chartSpec);

  return {
    sql: obj.sql,
    explanation: obj.explanation,
    chartSpec,
  };
}

function validateChartSpec(raw: unknown): ChartSpec | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== 'object') {
    return null;
  }

  const spec = raw as Record<string, unknown>;
  const validTypes = ['bar', 'line', 'pie', 'doughnut', 'table'];

  if (typeof spec.type !== 'string' || !validTypes.includes(spec.type)) {
    return null;
  }

  if (typeof spec.title !== 'string') {
    return null;
  }

  if (typeof spec.dataKey !== 'string') {
    return null;
  }

  if (typeof spec.labelKey !== 'string') {
    return null;
  }

  return {
    type: spec.type as ChartSpec['type'],
    title: spec.title,
    xLabel: typeof spec.xLabel === 'string' ? spec.xLabel : undefined,
    yLabel: typeof spec.yLabel === 'string' ? spec.yLabel : undefined,
    dataKey: spec.dataKey,
    labelKey: spec.labelKey,
  };
}
