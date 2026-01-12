---
id: 8370
title: Unify Portal Home with Global "Engine Environment" Background
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-01-06T22:34:07Z'
updatedAt: '2026-01-06T22:59:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8370'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T22:59:02Z'
---
# Unify Portal Home with Global "Engine Environment" Background

Implement a unified "Engine Environment" aesthetic for the Portal Home by applying a global background pattern.

**Concept:**
Instead of disparate sections, the entire homepage should feel like a single cohesive runtime environment.

**Changes:**
1.  **Global Background:** Move the "Quantum Mesh" background (neutral gray with subtle radial gradients) from `MainNeo.scss` to `MainContainer.scss`.
2.  **Fixed Attachment:** Use `background-attachment: fixed` on `MainContainer` so the mesh persists as the user scrolls, creating depth.
3.  **Transparency:** Ensure all child sections (`MainNeo`, `Features`, `AiToolchain`, `How`, `Colors`, `Helix`) have transparent backgrounds (including their wrappers like `.content-wrapper` and `.card-container`) so the global mesh is visible.
4.  **Exceptions:** Content cards (like `ContentBox`) retain their solid backgrounds for readability.

**Affected Files:**
- `resources/scss/src/apps/portal/home/MainContainer.scss` (Add Global BG)
- `resources/scss/src/apps/portal/home/parts/MainNeo.scss` (Remove local BG)
- `resources/scss/src/apps/portal/home/parts/AiToolchain.scss` (Add transparency)

## Timeline

- 2026-01-06T22:34:08Z @tobiu added the `enhancement` label
- 2026-01-06T22:34:08Z @tobiu added the `design` label
- 2026-01-06T22:58:19Z @tobiu referenced in commit `53673b9` - "feat(portal): Implement Global 'Engine Environment' Background (refs #8370)

- Moved 'Quantum Mesh' background to MainContainer with fixed attachment.
- Updated MainNeo and AiToolchain to be transparent."
### @tobiu - 2026-01-06T22:59:02Z

resolved via https://github.com/neomjs/neo/commit/53673b942b195586b6b4e14e1f864307798bffc4

- 2026-01-06T22:59:02Z @tobiu closed this issue
- 2026-01-06T22:59:07Z @tobiu assigned to @tobiu

