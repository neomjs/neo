---
id: 9723
title: 'Execution: Add Discovery Mandate to AGENTS_STARTUP.md'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T16:30:02Z'
updatedAt: '2026-04-05T16:33:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9723'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T16:33:46Z'
---
# Execution: Add Discovery Mandate to AGENTS_STARTUP.md

The issue of agents hallucinating standard React/Node commands (like `npx playwright test`) rather than querying the actual repository environment causes frequent context corruption ("Agentic Amnesia"). Furthermore, agents fail to proactively scan `.agent/skills` to discover expert workflows on boot.

This ticket tracks the addition of a **"Zero-Shot Discovery Mandate"** to `AGENTS_STARTUP.md`. Since `AGENTS_STARTUP.md` is invoked during the "Childhood" handshake of every new session, it is the perfect place to force an agent to run `view_file` on `package.json` and `.agent/skills` to ground itself before touching any code. 

Additionally, we will add an explicit instruction encouraging agents to recommend new skills if they identify recurring complex tasks that lack a documented workflow.

Task:
- Update `AGENTS_STARTUP.md` to include "Step 6: Discover the Repository Ecosystem & Skills".
- Add mandate to check `package.json` for available scripts.
- Add mandate to check `.agent/skills/` for capability workflows.
- Add encouragement to propose new skills when missing.
- Re-number subsequent steps.

## Timeline

- 2026-04-05T16:30:07Z @tobiu added the `enhancement` label
- 2026-04-05T16:30:07Z @tobiu added the `ai` label
- 2026-04-05T16:33:27Z @tobiu referenced in commit `10e6c85` - "feat: Add startup discovery mandate to AGENTS_STARTUP.md (#9723)"
- 2026-04-05T16:33:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-05T16:33:45Z

Implemented, mandate added to AGENTS_STARTUP.md.

- 2026-04-05T16:33:46Z @tobiu closed this issue
- 2026-04-05T16:33:48Z @tobiu cross-referenced by #9722

