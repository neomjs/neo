---
id: 9516
title: 'Portal HomeCanvas: Enhance spark contrast in dark theme'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-03-18T18:48:29Z'
updatedAt: '2026-03-18T18:50:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9516'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T18:50:15Z'
---
# Portal HomeCanvas: Enhance spark contrast in dark theme

Currently, the portal's `HomeCanvas` uses the same Indigo spark color (`#4B0082`) for both the light and dark themes. While this provides good contrast against the light gray background, it lacks visibility against the dark blue-tinted background of the dark theme.

This ticket proposes changing the `spark` color in the `dark` theme configuration to a bright neon purple (`#D500F9`) to ensure the sparks "pop" and maintain a high-contrast visual impact.

## Timeline

- 2026-03-18T18:48:30Z @tobiu added the `enhancement` label
- 2026-03-18T18:48:30Z @tobiu added the `design` label
- 2026-03-18T18:48:31Z @tobiu added the `ai` label
- 2026-03-18T18:49:41Z @tobiu referenced in commit `3ca8fd8` - "style(portal): Enhance HomeCanvas spark contrast in dark theme (#9516)"
- 2026-03-18T18:49:52Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-18T18:50:15Z

Implemented in 3ca8fd8d4

- 2026-03-18T18:50:15Z @tobiu closed this issue

