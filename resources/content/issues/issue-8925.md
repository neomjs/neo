---
id: 8925
title: 'Epic: Implement Specialized Agent Workflows (.agent/workflows/)'
state: OPEN
labels:
  - documentation
  - epic
  - developer-experience
  - ai
assignees: []
createdAt: '2026-01-31T15:39:28Z'
updatedAt: '2026-01-31T15:39:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8925'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8929 Feat: Implement Unit Test Agent Workflow (.agent/workflows/unit-test.md)'
subIssuesCompleted: 1
subIssuesTotal: 1
blockedBy: []
blocking: []
---
# Epic: Implement Specialized Agent Workflows (.agent/workflows/)

Create a system of specialized "Startup Profiles" for AI agents to optimize context usage and focus.

**Directory Structure:**
`/.agent/workflows/`

**Planned Profiles:**
1.  **`unit-test.md`**: Loads `Neo.mjs`, `Base.mjs`, and `UnitTesting.md`. Focuses on logic verification.
2.  **`component-test.md`**: Loads `ComponentTesting.md` and Browser-specific context. Focuses on interaction.
3.  **`architect.md`**: Loads `VISION.md`, `ROADMAP.md`. Focuses on high-level planning.
4.  **`doc-gardener.md`**: Focuses on finding and fixing missing JSDoc.

**Action:**
- Create the folder structure.
- Draft the initial MD files for each profile.
- Document how to invoke them (e.g., "Initialize as [Profile Name]").

## Timeline

- 2026-01-31T15:39:29Z @tobiu added the `documentation` label
- 2026-01-31T15:39:29Z @tobiu added the `epic` label
- 2026-01-31T15:39:30Z @tobiu added the `developer-experience` label
- 2026-01-31T15:39:30Z @tobiu added the `ai` label
- 2026-01-31T21:16:48Z @tobiu added sub-issue #8929

