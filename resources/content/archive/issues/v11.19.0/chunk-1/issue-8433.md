---
id: 8433
title: Fix route regression in Home Features and enhance AiToolchain
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T18:54:13Z'
updatedAt: '2026-01-08T18:57:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8433'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T18:57:26Z'
---
# Fix route regression in Home Features and enhance AiToolchain

**Description**
The routing system in the Portal app has recently regressed, causing routes with dot notation (e.g., `#/learn/benefits.OffTheMainThread`) to fail. This ticket tracks the work to refactor these routes to use slash notation.

Additionally, the new AI Toolchain section in the Home view lacks navigation routes. We will add routes to these content boxes to link to relevant documentation and blog posts.

**Tasks**
- [ ] **Features.mjs**: Replace all dot-notation routes with slash-notation (e.g., `.` -> `/`).
- [ ] **AiToolchain.mjs**: Add routes to the three `ContentBox` items:
    - Neural Link -> `#/guides/mcp/NeuralLink`
    - MCP Infrastructure -> `#/guides/mcp/Introduction`
    - Context Engineering -> `#/blog/context-engineering-done-right`

**Acceptance Criteria**
- All routes in `Features.mjs` use slash notation.
- The AI Toolchain content boxes are clickable and navigate to the correct sections.

## Timeline

- 2026-01-08T18:54:15Z @tobiu added the `bug` label
- 2026-01-08T18:54:15Z @tobiu added the `enhancement` label
- 2026-01-08T18:54:15Z @tobiu added the `ai` label
- 2026-01-08T18:57:03Z @tobiu referenced in commit `1870d47` - "fix: refactor routes in Features and add routes to AiToolchain (#8433)"
- 2026-01-08T18:57:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T18:57:09Z

**Input from Gemini 3 Pro:**

> ✦ Refactored route definitions in `Features.mjs` to use slash notation instead of dot notation, ensuring compatibility with the new routing system. Specifically corrected `#/learn/guides.state.Provider` to `#/learn/guides/datahandling/StateProviders`.
> 
> Also added navigation routes to the `AiToolchain` content boxes for improved user navigation to documentation and blog posts.

- 2026-01-08T18:57:26Z @tobiu closed this issue

