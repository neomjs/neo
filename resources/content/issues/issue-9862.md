---
id: 9862
title: Enforce Iterative Scope Change Comments for Pull Requests
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T11:00:01Z'
updatedAt: '2026-04-10T12:16:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9862'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-10T11:03:28Z'
---
# Enforce Iterative Scope Change Comments for Pull Requests

**The Problem:**
Currently, our `AGENTS.md` protocol mandates a Fat Ticket summary at PR creation. However, if an agent pushes *subsequent* commits to an open PR to address review feedback, add minor features, or fix bugs, there is no explicit rule forcing a follow-up comment. This creates "ghost diffs" where code changes happen invisibly without a corresponding textual explanation, disrupting both human review cycles and autonomous A2A graph ingestion.

**The Architectural Reality:**
This interacts directly with `AGENTS.md` (Section 8: Ticket Closure Protocol) and `AGENTS_STARTUP.md` (Section 9: Swarm Architecture).

**Proposed Solution:**
Update the protocols to explicitly mandate Iterative Post-Creation Modification Comments. E.g., "If you push new commits to an open Pull Request that alter the scope, fix a bug, or change the technical approach, you MUST post a new comment on the Pull Request. This comment must detail the delta of what was changed from the prior state."

## Timeline

- 2026-04-10T11:00:02Z @tobiu added the `enhancement` label
- 2026-04-10T11:00:02Z @tobiu added the `ai` label
- 2026-04-10T11:00:48Z @tobiu referenced in commit `aed5a89` - "docs: enforce iterative post-creation PR modification comments (#9862)"
- 2026-04-10T11:00:50Z @tobiu cross-referenced by PR #9863
- 2026-04-10T11:03:28Z @tobiu referenced in commit `57e5433` - "docs: enforce iterative post-creation PR modification comments (#9862) (#9863)"
- 2026-04-10T11:03:28Z @tobiu closed this issue
- 2026-04-10T12:16:31Z @tobiu assigned to @tobiu

