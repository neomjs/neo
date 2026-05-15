---
id: 8197
title: 'Feat: Neural Link - Export Domain Services in AI SDK'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-29T00:03:10Z'
updatedAt: '2026-01-05T16:04:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8197'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T16:04:20Z'
---
# Feat: Neural Link - Export Domain Services in AI SDK

**Context:**
To enable advanced "Self-Healing" and "Active Monitoring" workflows, standalone scripts (like `ai/examples/self-healing.mjs`) need direct access to Neural Link capabilities without going through the MCP protocol.

**Current State:**
`ai/services.mjs` (the SDK entry point) only exports `NeuralLink_ConnectionService`.

**Requirement:**
1.  **Export Domain Services:** Update `ai/services.mjs` to export:
    -   `NeuralLink_ComponentService`
    -   `NeuralLink_DataService`
    -   `NeuralLink_InteractionService` (etc.)
2.  **Ensure Safety:** Apply the `makeSafe()` wrapper to these services to enforce OpenAPI validation.
3.  **Lifecycle Management:** Ensure these services correctly handle initialization (`initAsync`) and dependency checks (e.g., waiting for `ConnectionService` to be ready/connected) before executing commands. This mimics the pattern used in Knowledge Base and Memory Core services.

**Goal:**
Empower standalone AI scripts to "import and use" the full power of the Neural Link.

## Timeline

- 2025-12-29T00:03:11Z @tobiu added the `enhancement` label
- 2025-12-29T00:03:11Z @tobiu added the `ai` label
- 2025-12-29T00:03:11Z @tobiu added the `architecture` label
- 2025-12-29T00:03:28Z @tobiu assigned to @tobiu
- 2025-12-29T00:03:46Z @tobiu added parent issue #8169
- 2026-01-05T16:03:32Z @tobiu referenced in commit `4a80bff` - "feat(ai): Export Neural Link services in AI SDK and enforce bridge connection (#8197)"
- 2026-01-05T16:04:21Z @tobiu closed this issue

