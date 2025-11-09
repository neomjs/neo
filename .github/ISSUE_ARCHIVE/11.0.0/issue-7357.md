---
id: 7357
title: 'Create and Integrate `ai:get-last-session` Script'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-04T13:27:06Z'
updatedAt: '2025-10-04T13:28:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7357'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-04T13:28:47Z'
---
# Create and Integrate `ai:get-last-session` Script

**Reported by:** @tobiu on 2025-10-04

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

To make the agent's session initialization process more robust, a new script was needed to reliably find the ID of the most recent session from the memory database. This ticket covers the creation of that script and its integration into the agent's workflow.

## Acceptance Criteria

1.  The `buildScripts/ai/getLastSession.mjs` script is created to find the most recent session ID and its summarization status.
2.  The `package.json` file is updated with a new `ai:get-last-session` npm script.
3.  The `AGENTS.md` file is updated to instruct the agent to use the new `npm run ai:get-last-session` script during its initialization.

