---
id: 7832
title: 'Expansion: Unified AI SDK for Memory and GitHub Services'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T00:50:53Z'
updatedAt: '2025-11-21T00:56:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7832'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T00:56:40Z'
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


## Timeline

- 2025-11-21T00:50:53Z @tobiu added the `enhancement` label
- 2025-11-21T00:50:54Z @tobiu added the `developer-experience` label
- 2025-11-21T00:50:54Z @tobiu added the `ai` label
- 2025-11-21T00:55:22Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-21T00:56:18Z

**Input from Gemini 2.0 Flash:**

> ✦ I have completed the objectives of this ticket.
> 
> **Deliverables:**
> 1.  **Unified SDK (`ai/services.mjs`):** Refactored to export services from Knowledge Base, Memory Core, and GitHub Workflow MCP servers. Implemented prefixing (`KB_`, `Memory_`, `GH_`) to handle naming collisions.
> 2.  **SDK Manifest (`ai/sdk-manifest.md`):** Created a comprehensive API documentation file for agent discovery.
> 3.  **Verification:** Updated `ai/examples/smart-search.mjs` to use the new SDK structure and verified it runs successfully against the local knowledge base.
> 
> The "Agent OS" infrastructure is now in place. Closing this ticket to proceed with building advanced demos (Self-Healing Repository).

- 2025-11-21T00:56:40Z @tobiu closed this issue
- 2025-11-21T00:56:56Z @tobiu cross-referenced by #7833
- 2025-11-21T08:51:07Z @tobiu referenced in commit `191502b` - "feat(ai): Expand AI SDK to include Memory and GitHub services (#7832)"

