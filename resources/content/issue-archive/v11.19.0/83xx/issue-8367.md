---
id: 8367
title: Redesign Portal Hero (MainNeo) Layout & Styling
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T20:30:55Z'
updatedAt: '2026-01-06T21:18:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8367'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T21:18:42Z'
---
# Redesign Portal Hero (MainNeo) Layout & Styling

Refactor the visual design and layout structure of `apps/portal/view/home/parts/MainNeo.mjs` to match the premium "Application Engine" positioning.

**Context:**
The text content was updated in #8360/8361, but the visual presentation remains basic. The goal is to elevate the aesthetics to a professional, "engine-grade" level.

**Scope:**
1.  **Layout:** Improve the vertical rhythm and spacing between the Logo, MagicMove text, Subhead, and Buttons.
2.  **Typography:** Optimize font sizes and weights for the "GT-Planar" H1 and the H3 subhead to create a stronger visual hierarchy.
3.  **Visuals:** Refine the background pattern/color in `MainNeo.scss` to be more modern.
4.  **Buttons:** Polish the button group styling (`.button-group`) for better call-to-action visibility.

**Files:**
- `apps/portal/view/home/parts/MainNeo.mjs`
- `resources/scss/src/apps/portal/home/parts/MainNeo.scss`

## Timeline

- 2026-01-06T20:30:56Z @tobiu added the `enhancement` label
- 2026-01-06T20:30:56Z @tobiu added the `design` label
- 2026-01-06T20:30:56Z @tobiu added the `ai` label
- 2026-01-06T20:31:10Z @tobiu assigned to @tobiu
- 2026-01-06T21:18:42Z @tobiu closed this issue
- 2026-01-07T13:25:09Z @jonnyamsp referenced in commit `b084459` - "feat(portal): Modernize Portal Hero styling (resolves #8367)

- Replace outdated background with neutral 'Quantum Mesh' gradient
- Update typography hierarchy (H1 size, H3 semantic colors)
- Improve layout vertical rhythm using gap and flex-direction
- Ensure button group is responsive and prioritized"

