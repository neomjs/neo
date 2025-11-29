---
id: 7917
title: 'Feat: Create ''Dev Agent'' MVP (Ticket -> PR)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:09:47Z'
updatedAt: '2025-11-29T15:09:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7917'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Activity Log

- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label

