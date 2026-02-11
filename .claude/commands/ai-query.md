# Add AI Query Capability

Add a new AI query type for: **$ARGUMENTS**

## Pre-requisites
Read these files first:
- `agent_docs/ai_pipeline.md` — pipeline architecture, prompt templates, validation
- `docs/ai/datamodel.md` — available tables and columns
- `docs/ai/api-endpoints.md` — chat API contract

## Steps

1. **Define Test Cases First** (TDD):
   - Add test cases to `backend/tests/ai-test-cases.json`:
     ```json
     {
       "question": "What was my top selling product this month?",
       "expectedSqlContains": ["SELECT", "products", "ORDER BY", "LIMIT"],
       "expectedSqlMustNot": ["DELETE", "UPDATE", "INSERT", "DROP"],
       "expectedChartType": "bar",
       "category": "products"
     }
     ```
   - Write at least 5 variations of the question (different phrasing)

2. **Update System Prompt**:
   - In `backend/ai/prompts/`, update the system prompt to handle this query pattern
   - Add example question→SQL pairs for few-shot learning
   - Include the relevant table schema in the context injection

3. **Add Chart Specification**:
   - Define the default chart type for this query category
   - Specify labels, dataset structure, colors
   - Add chart spec to `backend/charts/specs/`

4. **Implement & Validate**:
   - Run the test cases against the AI pipeline
   - Validate: SQL is SELECT-only, includes `store_id`, has timeout
   - Verify chart renders correctly with sample data

5. **Test**:
   - Unit tests for SQL validation
   - Integration test: question → SQL → execute → chart → response
   - Test with empty data (no orders/products)
   - Test with edge cases (date ranges, special characters in product names)

## Security Checklist
- [ ] Generated SQL is SELECT-only
- [ ] SQL includes WHERE store_id = ?
- [ ] No PII in AI API calls
- [ ] Query timeout ≤ 5 seconds
- [ ] Results validated before rendering
