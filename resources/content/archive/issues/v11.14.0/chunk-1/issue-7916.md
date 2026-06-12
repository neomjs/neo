---
id: 7916
title: 'Feat: Create ''PM Agent'' MVP (Epic -> Ticket Breakdown)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:09:44Z'
updatedAt: '2025-11-29T16:20:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7916'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T16:20:59Z'
---
# Feat: Create 'PM Agent' MVP (Epic -> Ticket Breakdown)

# Feat: Create 'PM Agent' MVP (Epic -> Ticket Breakdown)

## Context
This is the first step in the "Feature Factory" experiment (Epic #7914). We need a "Project Manager" agent that can take a high-level strategic goal (Epic) and break it down into actionable technical tasks (Tickets) for Developer Agents.

## Goal
Create a standalone Node.js script `ai/agents/pm.mjs` that acts as a "Headless PM Agent."

## Requirements

### 1. Input
*   The script must accept an **Epic Issue Number** as a CLI argument:
    `node ai/agents/pm.mjs --epic 123`

### 2. Logic (The "Brain")
*   **Read:** Fetch the Epic title and body using the GitHub MCP tools.
*   **Context:** Query the `KnowledgeBase` to understand the technical context of the request (e.g., "Add Dark Mode" -> Query "Theming", "CSS variables").
*   **Plan:** Use an LLM (via `ai/services.mjs` SDK) to break the Epic into 3-5 discrete, implementable steps.
*   **Format:** Ensure each step follows the **Protocol** defined in `ai/agents/PROTOCOL.md` (YAML structure, acceptance criteria).

### 3. Output (Execution)
*   **Create Issues:** The script must autonomously create new GitHub Issues for each step.
*   **Labeling:** Apply the correct labels: `agent-task:pending`, `agent-role:dev`, and the `ai-generated` tag.
*   **Linking:** Post a comment on the original Epic listing the created sub-tickets.

## Tech Stack
*   Use `ai/services.mjs` for the AI logic (Code Execution pattern).
*   Use `commander` for CLI parsing.
*   Use the `github-workflow` tools (via SDK import) for issue management.


## Timeline

- 2025-11-29T15:09:45Z @tobiu added the `enhancement` label
- 2025-11-29T15:09:45Z @tobiu added the `ai` label
- 2025-11-29T15:43:49Z @tobiu cross-referenced by #7927
- 2025-11-29T16:19:59Z @tobiu assigned to @tobiu
- 2025-11-29T16:20:48Z @tobiu referenced in commit `bc5859f` - "Feat: Create 'PM Agent' MVP (Epic -> Ticket Breakdown) #7916"
- 2025-11-29T16:20:59Z @tobiu closed this issue
- 2025-11-29T16:24:29Z @tobiu cross-referenced by #7914

