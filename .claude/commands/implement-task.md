# Implement Task from Feature Spec

Implement task **$ARGUMENTS** following the feature-first workflow.

## Step 1: Read the Task
Read the feature spec at `docs/features/$ARGUMENTS.md` (or find the relevant spec).
Understand:
- What needs to be implemented (Objective & Requirements)
- What files need to be created/modified (Code Impact)
- What tests are required (Test Plan)
- Verification criteria (Acceptance Criteria)

If no feature spec exists, STOP and ask me to run `/plan` first.

## Step 2: Explore Existing Patterns
Before implementing, explore the codebase to understand existing patterns:
- For **backend routes**: Look at `backend/src/routes/` for handler patterns
- For **backend services**: Look at `backend/src/services/` for business logic patterns
- For **database operations**: Look at `backend/db/` for migration and query patterns
- For **AI pipeline**: Look at `backend/ai/` for prompt and query patterns
- For **plugin PHP**: Look at `plugin/includes/` for class patterns
- For **plugin admin UI**: Look at `plugin/admin/` for React component patterns
- For **tests**: Look at existing test files for testing patterns

Use Grep for large files (>50KB) instead of reading them directly.

## Step 3: Enter Plan Mode
Enter plan mode to design the implementation approach. Create a detailed plan:
- Files to create/modify
- Code structure following existing patterns
- Test cases to implement
- Implementation sequence

Get user approval before proceeding.

## Step 4: Implement with Todo Tracking
Use TodoWrite to create a task list tracking each implementation step:
1. Create any new database migration files
2. Create/modify backend service files
3. Create/modify API route handlers
4. Create backend unit tests
5. Create/modify plugin PHP files (if applicable)
6. Create/modify React admin UI (if applicable)
7. Create plugin tests (if applicable)
8. Create integration tests
9. Run all tests to verify

Mark each todo as `in_progress` when starting and `completed` when done.

## Step 5: Run Tests
Run the test suites to verify everything works:
```bash
cd backend && npm test
cd plugin && composer test
```

All tests must pass before proceeding.

## Step 6: Update Tracker
- Update `task-tracker.md` to mark completed items
- Update the feature spec status if all tasks are done

## Step 7: Commit and Push
Create a descriptive commit with:
- Summary of what was implemented
- Reference to the feature spec
- Co-authored-by trailer

Then push to the current feature branch.

---

**Important Guidelines:**
- Follow existing code patterns exactly — don't introduce new conventions
- All timestamps must be UTC
- Use parameterized queries for SQL — never string concatenation
- Every DB query must include `WHERE store_id = ?`
- AI-generated SQL must be SELECT-only via read-only DB user
- Never send PII to external AI APIs
- Wrap errors with descriptive context
- Return empty arrays instead of null for list operations
- Write comprehensive tests: happy path, error cases, edge cases
