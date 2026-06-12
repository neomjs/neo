---
id: 7917
title: 'Feat: Create ''Dev Agent'' MVP (Ticket -> PR)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:09:47Z'
updatedAt: '2025-11-29T21:44:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7917'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T21:44:08Z'
---
# Feat: Create 'Dev Agent' MVP (Ticket -> PR)

# Feat: Create 'Dev Agent' MVP (Ticket -> PR)

## Context
This is the execution arm of the "Feature Factory" experiment (Epic #7914). Once a PM Agent has created technical tickets, we need a "Developer Agent" to pick them up and implement the code.

## Goal
Create a standalone Node.js script `ai/agents/dev.mjs` that acts as a "Headless Developer Agent."

## Requirements

### 1. Input
*   The script must accept an **Issue Number** as a CLI argument:
    `node ai/agents/dev.mjs --issue 456`
*   *(Future enhancement: Polling mode that scans for `agent-task:pending`)*

### 2. Logic (The "Brain")
*   **Read:** Fetch the Issue body (YAML contract) to understand the requirements.
*   **Explore:** Use `codebase_investigator` or `search_file_content` (via SDK) to locate relevant files.
*   **Implement:** Use `read_file` / `write_file` to modify the code.
*   **Verify:** Run tests (if specified in the ticket) to ensure correctness.

### 3. Output (Execution)
*   **Commit:** Create a new branch `feature/issue-456`.
*   **Push:** Push changes to the repository.
*   **PR:** Create a Pull Request linking to the original issue.
*   **Update Status:** Update the issue labels to `agent-task:completed` (or `agent-task:blocked` if it failed).

## Tech Stack
*   Use `ai/services.mjs` for the AI logic.
*   Use `simple-git` or shell commands for Git operations.
*   Adhere strictly to the `ai/agents/PROTOCOL.md` state machine.


## Timeline

- 2025-11-29T15:09:48Z @tobiu added the `enhancement` label
- 2025-11-29T15:09:49Z @tobiu added the `ai` label
- 2025-11-29T16:24:29Z @tobiu cross-referenced by #7914
### @tobiu - 2025-11-29T21:18:13Z

**Input from Gemini 2.5:**

> ✦ **Implementation Update:**
> Adopting the "Fake Agent" pattern to accelerate the MVP.
> - **Architecture:** The agent is a standalone Node.js script using direct imports from `ai/services.mjs`.
> - **Context:** The agent now consumes the **full raw markdown content** of the issue (including frontmatter) to provide maximum context to the LLM.
> - **Execution:** Uses `child_process` for Git operations and `GoogleGenerativeAI` for code generation.

### @tobiu - 2025-11-29T21:43:57Z

**Feature Factory Success:**
The  MVP is operational.
- Executed on Test Issue #7933.
- Created Branch .
- Modified .
- Submitted PR #7934.

The infrastructure () has been pushed to .
Closing this implementation ticket.

- 2025-11-29T21:44:08Z @tobiu closed this issue

