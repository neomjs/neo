---
id: 9696
title: Tri-Vector REM Synthesis (Sandman Upgrade)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T15:35:51Z'
updatedAt: '2026-04-04T15:41:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9696'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T15:41:50Z'
---
# Tri-Vector REM Synthesis (Sandman Upgrade)

Implement Tri-Vector extraction for the background Sandman process to correctly capture operational momentum and roadmap pivot proposals, not just Semantic Graph Nodes.

- Upgrade `DreamService.mjs` prompt to enforce a structured JSON schema (`summary`, `open_deltas`, `roadmap_impact`, `graph`).
- Extract Deltas to a local handoff file (`resources/content/sandman_handoff.md`).
- Extract Roadmap impacts to a local audit log (`/tmp/roadmap_audits.log`).
- Ensures offline AI background jobs do not pollute GitHub tracking systems automatically while preserving human-in-the-loop task completion.

## Timeline

- 2026-04-04T15:35:52Z @tobiu added the `enhancement` label
- 2026-04-04T15:35:53Z @tobiu added the `ai` label
- 2026-04-04T15:35:53Z @tobiu added the `architecture` label
- 2026-04-04T15:36:05Z @tobiu assigned to @tobiu
- 2026-04-04T15:41:28Z @tobiu referenced in commit `06fcbf1` - "feat: Implement Tri-Vector Rem Synthesis (#9696)"
### @tobiu - 2026-04-04T15:41:48Z

Completed Tri-Vector Refactor.
- Tri-Vector Extraction via Ollama correctly separates Semantic Graph, Deltas, and Strategy.
- Local Markdown Handoff correctly dumps Open Deltas to `sandman_handoff.md`.
- Tested and Validated offline formatting.
- Changes pushed to remote.

- 2026-04-04T15:41:50Z @tobiu closed this issue

