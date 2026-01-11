---
id: 8368
title: Replace "AfterMath" with "AI-Native Toolchain" Section
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T21:32:26Z'
updatedAt: '2026-01-06T21:40:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8368'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T21:40:12Z'
---
# Replace "AfterMath" with "AI-Native Toolchain" Section

Replace the ineffective "AfterMath" section with a new **"AI-Native Toolchain"** section that highlights Neo.mjs's unique AI capabilities.

**Content Focus:**
1.  **Headline:** "Code at the Speed of Thought."
2.  **Subhead:** "AI agents can now 'see' and 'touch' your running app via the Neural Link."
3.  **Key Metrics:** "181 tickets resolved in 15 days using these tools."
4.  **Three Feature Cards:**
    *   **The Neural Link:** Live debugging, conversational UI changes, zero-downtime hotfixes.
    *   **MCP Servers:** Knowledge Base, Memory Core, GitHub Workflow.
    *   **Context Engineering:** How the architecture enables AI collaboration.

**Implementation Plan:**
1.  **Create:** `apps/portal/view/home/parts/AiToolchain.mjs` (New Component).
2.  **Create:** `resources/scss/src/apps/portal/home/parts/AiToolchain.scss` (New Styles).
3.  **Update:** `apps/portal/view/home/MainContainer.mjs` (Swap `AfterMath` -> `AiToolchain`).
4.  **Delete:** `apps/portal/view/home/parts/AfterMath.mjs` & `AfterMath.scss`.

## Timeline

- 2026-01-06T21:32:27Z @tobiu added the `enhancement` label
- 2026-01-06T21:32:27Z @tobiu added the `design` label
- 2026-01-06T21:32:27Z @tobiu added the `ai` label
- 2026-01-06T21:32:50Z @tobiu assigned to @tobiu
- 2026-01-06T21:40:13Z @tobiu closed this issue
- 2026-01-07T13:25:09Z @jonnyamsp referenced in commit `90c6ff6` - "feat(portal): Replace AfterMath with AI-Native Toolchain section (resolves #8368)

- Replaces the legacy contact list with a new 'AI-Native Toolchain' feature section.
- Highlights Neural Link, MCP Servers, and Context Engineering.
- Uses VDOM-based rendering for static content security and performance.
- Modern 'Application Engine' styling with semantic variables and grid layout."

