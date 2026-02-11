#!/bin/bash
#
# dev-loop.sh - Automated development loop for WooCommerce AI Analytics
#
# Usage:
#   ./scripts/dev-loop.sh                    # Run once
#   ./scripts/dev-loop.sh --iterations 5     # Run 5 iterations
#   ./scripts/dev-loop.sh --dry-run          # Preview without executing
#   ./scripts/dev-loop.sh --verbose          # Detailed output
#

set -uo pipefail

# === Configuration ===
ITERATIONS=1
DRY_RUN=false
VERBOSE=false
BRANCH_PREFIX="claude/implement-feature"

# Implementation prompt
IMPLEMENTATION_PROMPT='Read task-tracker.md and pick the first un-implemented task.
Read the corresponding feature spec in docs/features/ if one exists.
Read relevant docs/ai/ context maps for understanding.
Implement the task fully with tests (unit + integration).

CRITICAL RULES:
- Every DB query MUST include WHERE store_id = ? (tenant isolation)
- AI-generated SQL must be SELECT-only
- Never send PII to external APIs
- All WP AJAX must use nonces
- Parameterized SQL only (no string concatenation)
- Follow existing code patterns in the codebase
- 90% test coverage target

After implementation:
1. Run all tests: cd backend && npm test; cd plugin && composer test
2. Update task-tracker.md marking the task as done
3. Update docs/ai/ if architecture changed'

REVIEW_COMMAND='/review-and-fix'

CLAUDE_FLAGS="--permission-mode bypassPermissions --no-session-persistence --verbose"

# === Colors ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# === Helper Functions ===
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}=== $1 ===${NC}"; }
verbose() { if [ "$VERBOSE" = true ]; then echo -e "${YELLOW}[VERBOSE]${NC} $1"; fi; }

generate_id() { cat /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 5; }

has_changes() {
    ! git diff --quiet 2>/dev/null || \
    ! git diff --cached --quiet 2>/dev/null || \
    [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]
}

run_claude_implementation() {
    local prompt="$1"
    local exit_code=0
    verbose "Running Claude Code for implementation..."
    local output
    output=$(claude $CLAUDE_FLAGS -p "$prompt" 2>&1) || exit_code=$?
    if [ ${#output} -gt 2000 ]; then echo "${output: -2000}"; else echo "$output"; fi
    if echo "$output" | grep -q "MaxFileReadTokenExceededError"; then
        log_error "Critical error: File too large to read"; return 1
    fi
    if has_changes; then log_success "Implementation made changes"; return 0;
    else
        if [ $exit_code -ne 0 ] && ! echo "$output" | grep -qE "event.*failed|telemetry|NON-FATAL"; then
            log_error "Claude failed with no changes"; return 1
        else log_warning "No changes made"; return 1; fi
    fi
}

run_claude_review() {
    local command="$1"
    local exit_code=0
    verbose "Running Claude Code for review..."
    local output
    output=$(claude $CLAUDE_FLAGS -p "$command" 2>&1) || exit_code=$?
    if [ ${#output} -gt 2000 ]; then echo "${output: -2000}"; else echo "$output"; fi
    if [ $exit_code -eq 0 ]; then log_success "Review completed"; return 0;
    elif echo "$output" | grep -qE "event.*failed|telemetry|NON-FATAL|Lock acquisition failed"; then
        log_warning "Review completed with non-fatal errors"; return 0;
    else log_error "Review failed"; return 1; fi
}

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Automated dev loop for WooCommerce AI Analytics plugin.

Options:
    --iterations N    Run N iterations (default: 1)
    --dry-run         Preview without executing
    --verbose         Detailed output
    --help            Show this help

Workflow per iteration:
    1. Create branch from main
    2. Claude implements next task from task-tracker.md
    3. Create PR via gh CLI
    4. Wait for Gemini/Jetrix review comments
    5. Run /review-and-fix to address all comments
    6. Auto-merge
EOF
}

check_prerequisites() {
    log "Checking prerequisites..."
    local missing=()
    command -v claude &>/dev/null || missing+=("claude")
    command -v gh &>/dev/null || missing+=("gh")
    command -v git &>/dev/null || missing+=("git")
    command -v docker &>/dev/null || missing+=("docker")
    if [ ${#missing[@]} -ne 0 ]; then log_error "Missing: ${missing[*]}"; return 1; fi
    if ! gh auth status &>/dev/null; then log_error "gh not authenticated"; return 1; fi
    if ! git rev-parse --git-dir &>/dev/null; then log_error "Not in git repo"; return 1; fi
    log_success "All prerequisites met"
}

# === Main Loop ===
run_iteration() {
    local iteration=$1
    local id=$(generate_id)
    local branch="${BRANCH_PREFIX}-${id}"
    local PR_URL="" PR_NUMBER=""

    log_step "Iteration $iteration: Starting"

    # Step 1: Branch
    log_step "Step 1: Create Branch ($branch)"
    if [ "$DRY_RUN" = true ]; then log "[DRY-RUN] Would create branch: $branch"
    else
        git checkout main || git checkout master || { log_error "Failed checkout"; return 1; }
        git pull || { log_error "Failed pull"; return 1; }
        git checkout -b "$branch" || { log_error "Failed create branch"; return 1; }
    fi

    # Step 2: Implement
    log_step "Step 2: Claude Implementation"
    if [ "$DRY_RUN" = true ]; then log "[DRY-RUN] Would run implementation"
    else
        if ! run_claude_implementation "$IMPLEMENTATION_PROMPT"; then
            if has_changes; then log_warning "Errors but changes made, continuing..."
            else
                log_error "No changes made"; git checkout main 2>/dev/null || git checkout master
                git branch -D "$branch" 2>/dev/null; return 1
            fi
        fi
    fi

    # Step 3: Create PR
    log_step "Step 3: Create PR"
    if [ "$DRY_RUN" = true ]; then log "[DRY-RUN] Would create PR"
    else
        if ! has_changes; then
            log_warning "No changes to commit"
            git checkout main 2>/dev/null || git checkout master
            git branch -D "$branch" 2>/dev/null; return 0
        fi
        git add -A
        git commit -m "feat: implement task from tracker

Automated via dev-loop.sh
Co-Authored-By: Claude <noreply@anthropic.com>"
        git push -u origin "$branch"
        PR_URL=$(gh pr create --fill --base main 2>/dev/null || gh pr create --fill --base master)
        PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
        log_success "PR created: $PR_URL (#$PR_NUMBER)"
    fi

    # Step 4: Wait for external reviews + run review-and-fix
    log_step "Step 4: Review & Fix"
    if [ "$DRY_RUN" = false ]; then
        log "Waiting 5 min for external review comments..."
        sleep 300
        run_claude_review "$REVIEW_COMMAND"
        if has_changes; then
            git add -A
            git commit -m "fix: address review feedback

Co-Authored-By: Claude <noreply@anthropic.com>" 2>/dev/null
            git push 2>/dev/null
            log_success "Review fixes pushed"
        fi
    fi

    # Step 5: Merge
    log_step "Step 5: Merge PR"
    if [ "$DRY_RUN" = true ]; then log "[DRY-RUN] Would merge"
    else
        sleep 10
        if gh pr merge "$PR_NUMBER" --squash 2>/dev/null; then
            log_success "PR #$PR_NUMBER merged!"
        else
            gh pr merge "$PR_NUMBER" --squash --auto 2>/dev/null || true
            log "Auto-merge enabled for PR #$PR_NUMBER"
        fi
        git checkout main 2>/dev/null || git checkout master
        git pull 2>/dev/null
        git branch -D "$branch" 2>/dev/null
    fi

    log_step "Iteration $iteration: Complete"
}

# === Parse Args ===
while [[ $# -gt 0 ]]; do
    case $1 in
        --iterations) ITERATIONS="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --verbose) VERBOSE=true; shift ;;
        --help) show_help; exit 0 ;;
        *) log_error "Unknown: $1"; show_help; exit 1 ;;
    esac
done

# === Run ===
echo -e "${CYAN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║     Woo AI Analytics — Automated Dev Loop                  ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

log "Config: iterations=$ITERATIONS dry_run=$DRY_RUN verbose=$VERBOSE"
[ "$DRY_RUN" = true ] && log_warning "DRY RUN MODE"
check_prerequisites || exit 1

COMPLETED=0 FAILED=0
for i in $(seq 1 "$ITERATIONS"); do
    echo -e "\n${CYAN}━━━ Iteration $i of $ITERATIONS ━━━${NC}"
    if run_iteration "$i"; then COMPLETED=$((COMPLETED + 1));
    else FAILED=$((FAILED + 1)); break; fi
done

echo -e "\n${CYAN}━━━ Summary ━━━${NC}"
log "Completed: $COMPLETED | Failed: $FAILED"
[ $FAILED -eq 0 ] && log_success "All done!" || { log_error "$FAILED failed"; exit 1; }
