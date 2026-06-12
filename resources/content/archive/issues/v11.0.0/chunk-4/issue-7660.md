---
id: 7660
title: 'Refine Memory Protocol: Define a "Turn" and Consolidate Sub-Turns'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-26T10:20:32Z'
updatedAt: '2025-10-26T10:23:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7660'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-26T10:23:52Z'
---
# Refine Memory Protocol: Define a "Turn" and Consolidate Sub-Turns

This ticket is a follow-up to #7658.

While the current protocol mandates saving every turn, it doesn't clearly define what constitutes a "turn". This leads to a problem of "sub-turns", where an agent's multiple attempts to use a tool for a single user prompt are saved as separate, noisy memories.

We need to refine the protocol with a clearer definition.

**Proposed Definition of a "Turn":**
A single "turn" encompasses the entire agent process from receiving a user's `PROMPT` to delivering the final `RESPONSE` that awaits the next user prompt. All intermediate steps (tool calls, self-corrections, errors, and retries) are considered part of this single turn.

**Proposed Protocol Refinement:**

1.  The agent must internally accumulate its thought process, including all tool attempts and self-corrections, throughout its entire process for a given prompt.
2.  The `add_memory` tool must only be called **once** per turn, at the very end, just before delivering the final response to the user.
3.  The `thought` parameter for the `add_memory` call should be a consolidated summary of the *entire* internal monologue for that turn.
4.  The `response` parameter should be a consolidated log of all responses generated during the turn, including self-corrections, error messages, and the final response to the user.

This change will significantly increase the signal-to-noise ratio of the stored memories. It also acknowledges the current limitation of not having agent lifecycle hooks and places the responsibility of consolidating the turn on the agent itself.

## Timeline

- 2025-10-26T10:20:34Z @tobiu added the `documentation` label
- 2025-10-26T10:20:34Z @tobiu added the `enhancement` label
- 2025-10-26T10:20:34Z @tobiu added the `ai` label
- 2025-10-26T10:20:34Z @tobiu added the `refactoring` label
- 2025-10-26T10:20:59Z @tobiu assigned to @tobiu
- 2025-10-26T10:21:06Z @tobiu added parent issue #7604
- 2025-10-26T10:23:23Z @tobiu referenced in commit `7918d8b` - "Refine Memory Protocol: Define a "Turn" and Consolidate Sub-Turns #7660"
- 2025-10-26T10:23:52Z @tobiu closed this issue
- 2025-10-26T10:33:22Z @tobiu cross-referenced by #7661

