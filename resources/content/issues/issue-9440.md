---
id: 9440
title: 'AI Workflow: Integrate Anchor & Echo strategy into Pre-Flight Commit check'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-11T11:01:03Z'
updatedAt: '2026-03-11T11:02:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9440'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-11T11:02:12Z'
---
# AI Workflow: Integrate Anchor & Echo strategy into Pre-Flight Commit check

### Background
Agents frequently forget to apply the Knowledge Base Enhancement Strategy before committing code, treating it as an afterthought. Furthermore, the existing strategy in `AGENTS_STARTUP.md` did not account for the semantic chunking behavior of the ChromaDB knowledge base.

### Implementation
1. **`AGENTS_STARTUP.md`:** Updated Section 3.2 to formally define the "Anchor & Echo" documentation strategy, explaining how to write JSDoc that survives semantic chunking by avoiding "Implied Context". We merged this new concept with the existing "semantic signpost" strategy to create a comprehensive guide.
2. **`AGENTS.md`:** Modified the "Pre-Flight Check for Commits" protocol. Agents are now mandated to explicitly verify they have applied the Anchor & Echo strategy to their modified code before they are allowed to execute `git commit`.

This ensures that maintaining the quality of the AI Knowledge Base is a structural requirement within the Definition of Done for every task.

## Timeline

- 2026-03-11T11:01:03Z @tobiu assigned to @tobiu
- 2026-03-11T11:01:04Z @tobiu added the `documentation` label
- 2026-03-11T11:01:04Z @tobiu added the `enhancement` label
- 2026-03-11T11:01:04Z @tobiu added the `ai` label
- 2026-03-11T11:01:43Z @tobiu referenced in commit `358ffbc` - "docs(ai): integrate Anchor & Echo strategy into Pre-Flight Commit check (#9440)"
### @tobiu - 2026-03-11T11:02:12Z

Changes committed and pushed in 358ffbcfb.

- 2026-03-11T11:02:13Z @tobiu closed this issue

