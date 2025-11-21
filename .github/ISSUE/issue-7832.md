---
id: 7832
title: 'Expansion: Unified AI SDK for Memory and GitHub Services'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - ai
assignees: []
createdAt: '2025-11-21T00:50:53Z'
updatedAt: '2025-11-21T00:50:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7832'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Expansion: Unified AI SDK for Memory and GitHub Services

**Objective**
Expand the recently created AI SDK (`ai/services.mjs`) to include services from the Memory Core and GitHub Workflow MCP servers. This creates a unified "Agent OS" API that allows agents to interact with all project infrastructure programmatically.

**Context**
The initial PoC (#7831) proved the viability of the "Code Execution" pattern using the Knowledge Base services. To fully realize the "Thick Client" vision, agents need access to long-term memory and GitHub operations within the same SDK.

**Tasks**
1.  **Update SDK:** Modify `ai/services.mjs` to export `MemoryService`, `SessionService`, `IssueService`, etc.
2.  **Namespace Management:** Implement a prefixing strategy (`KB_`, `Memory_`, `GH_`) to avoid naming collisions (e.g., `HealthService`).
3.  **Update Manifest:** Expand `ai/sdk-manifest.md` to document the new capabilities.
4.  **Verify:** Ensure the existing `smart-search` example still works with the updated SDK.

**Deliverables**
- Updated `ai/services.mjs`
- Updated `ai/sdk-manifest.md`
- Verified `ai/examples/smart-search.mjs`


## Activity Log

- 2025-11-21 @tobiu added the `enhancement` label
- 2025-11-21 @tobiu added the `developer-experience` label
- 2025-11-21 @tobiu added the `ai` label

