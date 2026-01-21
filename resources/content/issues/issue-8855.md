---
id: 8855
title: Switch Portal App Default Theme to Dark
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T19:54:23Z'
updatedAt: '2026-01-21T19:56:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8855'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T19:56:26Z'
---
# Switch Portal App Default Theme to Dark

- **Goal:** Switch the Neo.mjs Portal App (`apps/portal`) to use the Dark Theme as the default experience.
- **Rationale:**
    - Aligns with the new "Application Engine" / "Agent OS" branding (Cyber/Engineering aesthetic).
    - Maximizes visual impact of new additive-blend Canvas effects (Neural Mesh, Event Horizon).
    - Aligns with the preference of the core developer demographic.
- **Tasks:**
    - Modify `apps/portal/neo-config.json` to place `neo-theme-dark` first in the `themes` array.
    - Verify that `src/worker/Manager.mjs` correctly respects this default order when no local storage or system preference is found.
    - **QA:** Verify text contrast and readability on long-form documentation pages in Dark Mode.


## Timeline

- 2026-01-21T19:54:25Z @tobiu added the `enhancement` label
- 2026-01-21T19:54:25Z @tobiu added the `design` label
- 2026-01-21T19:54:25Z @tobiu added the `ai` label
- 2026-01-21T19:55:54Z @tobiu referenced in commit `b046edf` - "feat: Make Dark Theme default for Portal App (#8855)"
- 2026-01-21T19:56:26Z @tobiu closed this issue
- 2026-01-21T19:56:29Z @tobiu assigned to @tobiu

