---
id: 9657
title: 'Sub-Epic 5C: Build E2E Agent GraphRAG Synthesis Test'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-03T11:31:39Z'
updatedAt: '2026-06-23T03:17:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9657'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-23T03:17:24Z'
---
# Sub-Epic 5C: Build E2E Agent GraphRAG Synthesis Test

**Epic:** #9643

**Description:**
Build the E2E Test workflow demonstrating a base Agent triggering a request that is delegated to the Librarian, where the Librarian traverses the Graph topology and synthesizes a complex architectural answer.

## Timeline

- 2026-04-03T11:31:40Z @tobiu added the `enhancement` label
- 2026-04-03T11:31:40Z @tobiu added the `ai` label
### @neo-gpt - 2026-06-23T03:17:14Z

[ARCH_ALIGNMENT]

Ticket-intake verdict: **already-resolved / missing close-link**, not a current implementation lane.

Evidence checked on 2026-06-23:

- #9657 is still open, unassigned, and unchanged since `2026-04-03T11:31:39Z`; labels are only `enhancement` + `ai`. With the current 90-day inactive-issue stale window, this is still `pre-stale`, but bot freshness is not architecture freshness.
- The ticket asks for a workflow where a primary/base Agent delegates to the `Librarian`, the Librarian traverses GraphRAG context, and the primary Agent synthesizes the final answer.
- Parent #9643 is closed. Its closure trail says: "Sub-Agent orchestration & E2E unit testing complete. The test has been migrated to the Playwright suite..."
- The implementation exists as `test/playwright/unit/ai/agent/Librarian.spec.mjs`, specifically `Primary Agent delegates research task to Librarian via Loop tool execution`. The test wraps `primaryAgent.delegate`, asserts `delegatedAgentAlias === 'librarian'`, runs the real loop, and checks a synthesized final answer. Because it performs real inference / GraphRAG IO, the current gate is `NEO_RUN_LIVE_AI_TESTS=1`.
- Git history confirms the close-link mismatch: `f224134674 test: Migrate Librarian Sub-Agent E2E test to robust Playwright Unit suite (#9643)` added the relevant coverage under the parent issue instead of closing #9657 directly. `gh pr list --search "9657"` returned no PRs.
- The surrounding epic chain is also closed / superseded: #9643 closed, #9638 closed, and successor masterplan #9671 closed. Any new coverage request should be cut as a fresh, current-contract test ticket against today’s Agent / Memory Core / Knowledge Base surfaces, not resurrected from this old sub-epic.

I am closing #9657 as completed rather than claiming it. This keeps the implementation queue honest and preserves the close-link evidence for future agents.

- 2026-06-23T03:17:24Z @neo-gpt closed this issue

