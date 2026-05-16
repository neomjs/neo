---
id: 7833
title: 'Demo: Self-Healing Repository Script (Agent OS)'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T00:56:55Z'
updatedAt: '2025-11-21T01:16:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7833'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T01:16:31Z'
---
# Demo: Self-Healing Repository Script (Agent OS)

**Objective**
Develop a proof-of-concept "Self-Healing" script that demonstrates the full power of the Agent OS SDK (`ai/services.mjs`). The script will autonomously simulate a bug fix workflow by interacting with GitHub issues, the Knowledge Base, and the Memory Core.

**Context**
We have established the "Code Execution" infrastructure (#7831, #7832). The next step is to prove its value with a complex, multi-domain use case. This demo will serve as the canonical example for the "Agent OS" vision.

**Workflow to Implement (`ai/examples/self-healing.mjs`)**
1.  **Monitor:** Use `GH_IssueService` to find an open issue labeled `bug` (or a specific test issue).
2.  **Understand:** Use `KB_QueryService` to search for code and documentation relevant to the issue's title/body.
3.  **Plan:** Use `Memory_Service` to log the agent's "thought process" and plan of attack.
4.  **Act (Simulation):**
    -   In a real scenario, this would run tests.
    -   For this PoC, the script will "draft" a fix (e.g., generate a patch file or a comment) based on the retrieved context.
5.  **Report:** Post a comment on the GitHub issue with the proposed solution and references to the docs used.

**Deliverables**
-   `ai/examples/self-healing.mjs`: The executable script.
-   Updates to `ai/sdk-manifest.md` if new patterns emerge.

**Dependencies**
-   Requires `ai/services.mjs` (Completed).
-   Requires a test issue in the repo to act upon.


## Timeline

- 2025-11-21T00:56:56Z @tobiu added the `enhancement` label
- 2025-11-21T00:56:56Z @tobiu added the `developer-experience` label
- 2025-11-21T00:56:56Z @tobiu added the `ai` label
- 2025-11-21T00:57:32Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-21T01:16:15Z

**Input from Gemini 3.0 Preview:**

I have successfully implemented and validated the "Self-Healing" demo script.

**Deliverables:**
1.  **`ai/examples/self-healing.mjs`**: A fully autonomous script that monitors GitHub for bugs, queries the Knowledge Base for context, logs a plan to Memory, and posts a solution to the issue.
2.  **Validation**: Ran the script against test issue #7834. The agent successfully identified `DomEvents.md` as the relevant context and posted a structured analysis comment.

This confirms that the "Agent OS" architecture (Unified SDK + Code Execution) allows agents to perform complex, multi-step maintenance tasks without human intervention.

Closing ticket.

- 2025-11-21T01:16:32Z @tobiu closed this issue
- 2025-11-21T08:51:07Z @tobiu referenced in commit `e90762c` - "feat(ai): Add Self-Healing Repository demo script (#7833)"

