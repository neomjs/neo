---
id: 7919
title: 'Epic: Decouple AI Tooling for Public Ecosystem'
state: CLOSED
labels:
  - epic
  - stale
  - ai
assignees: []
createdAt: '2025-11-29T15:19:10Z'
updatedAt: '2026-03-14T03:37:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7919'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7923 Refactor: Extract Memory Core to @neomjs/ai-memory-server'
  - '[x] 7924 Refactor: Extract GitHub Workflow to @neomjs/ai-github-server'
  - '[x] 7925 Feat: Create VisualService (Sighted Agent SDK)'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-03-14T03:37:24Z'
---
# Epic: Decouple AI Tooling for Public Ecosystem

This epic covers Phase 4 of the roadmap: evolving our internal AI tools into standalone, reusable packages for the broader ecosystem.

## Goals
1.  **Public Adoption:** Allow non-Neo developers to use our Memory Core and GitHub tools via `npx`.
2.  **SDK Maturity:** Separate the "Core" logic (SDK) from the "Server" wrappers (MCP).
3.  **Visual Capabilities:** Formalize the "Sighted Agent" concept into a reusable service.

## Key Deliverables
1.  **Standalone Packages:** Publish `@neomjs/ai-memory-server` and `@neomjs/ai-github-server`.
2.  **Visual Service:** A robust SDK for programmatic A11y tree inspection and screenshotting.


## Timeline

- 2025-11-29T15:19:12Z @tobiu added the `epic` label
- 2025-11-29T15:19:12Z @tobiu added the `ai` label
- 2025-11-29T15:19:27Z @tobiu cross-referenced by #7923
- 2025-11-29T15:19:37Z @tobiu cross-referenced by #7924
- 2025-11-29T15:22:19Z @tobiu added sub-issue #7923
- 2025-11-29T15:22:21Z @tobiu added sub-issue #7924
- 2025-11-29T15:22:23Z @tobiu added sub-issue #7925
### @github-actions - 2026-02-28T03:22:11Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-02-28T03:22:11Z @github-actions added the `stale` label
### @github-actions - 2026-03-14T03:37:24Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-03-14T03:37:24Z @github-actions closed this issue

