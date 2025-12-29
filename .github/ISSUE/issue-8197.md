---
id: 8197
title: 'Feat: Neural Link - Export Domain Services in AI SDK'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-29T00:03:10Z'
updatedAt: '2025-12-29T00:03:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8197'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-29 @tobiu added the `enhancement` label
- 2025-12-29 @tobiu added the `ai` label
- 2025-12-29 @tobiu added the `architecture` label
- 2025-12-29 @tobiu assigned to @tobiu
- 2025-12-29 @tobiu added parent issue #8169

