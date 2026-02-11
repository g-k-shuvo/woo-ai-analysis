# Review and Fix PR

Comprehensive PR review workflow that reviews, fixes issues, simplifies code, and addresses GitHub comments.

## Steps

1. **Run PR Review**: Use the `pr-review-toolkit:review-pr` skill to perform a comprehensive review of the current branch's PR using specialized agents (code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer).

2. **Address ALL Issues**: After the review completes, systematically address EVERY issue identified regardless of severity:
   - Create a todo list to track each issue (critical, important, AND suggestions)
   - Fix each issue one by one — do not skip any issues
   - This includes: critical issues, important issues, medium priority, low priority, and suggestions
   - Run tests after fixes to verify nothing is broken:
     ```bash
     cd backend && npm test
     cd plugin && composer test
     ```

3. **Project-Specific Checks**: Verify these critical rules:
   - All DB queries include `WHERE store_id = ?` (tenant isolation)
   - No PII sent to external AI APIs
   - All WP AJAX handlers use nonce verification
   - AI-generated SQL is SELECT-only
   - All inputs sanitized, all outputs escaped (WordPress standards)
   - Parameterized SQL queries (no string concatenation)

4. **Simplify Code**: Use the `code-simplifier:code-simplifier` agent to refine and simplify the recently modified code while preserving functionality.

5. **Address ALL GitHub Comments**: Check the PR on GitHub for any inline review comments and address ALL of them:
   - Use `gh api repos/{owner}/{repo}/pulls/{number}/comments` to get inline comments
   - **Add EVERY comment to the todo list** — this ensures nothing is missed
   - Fix EVERY comment's concern regardless of priority
   - This includes refactoring suggestions, code organization improvements, and "nice to have" changes
   - Do NOT classify any comment as "low priority" or "not essential" — implement ALL suggestions
   - Commit and push the additional fixes

6. **Verify All Comments Addressed**: Before final push, review the GitHub comments list again:
   - Confirm each comment has been addressed with a specific code change
   - If any comment was missed, fix it immediately
   - Do NOT mark workflow as complete until every single comment is addressed

7. **Push Changes**: Commit and push all fixes to the remote branch with a descriptive commit message.

## Important

- Do NOT skip issues based on priority — fix everything
- Do NOT defer "nice to have" suggestions — implement them
- Do NOT classify refactoring suggestions as "out of scope" — they are in scope
- Every GitHub review comment represents feedback that MUST be acted upon
- The goal is zero unaddressed feedback after this workflow completes

## Usage
Run this command on a branch that has an open PR to get a full review cycle completed.
