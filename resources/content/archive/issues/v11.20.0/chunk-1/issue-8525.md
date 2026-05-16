---
id: 8525
title: Add Release badge to Ticket Header for navigation
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-10T21:39:59Z'
updatedAt: '2026-01-10T21:40:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8525'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T21:40:49Z'
---
# Add Release badge to Ticket Header for navigation

**Goal:** Enhance the Tickets KB in Portal to provide a direct link from a Ticket to its parent Release.

**Changes:**
1.  **`apps/portal/view/news/tickets/Component.mjs`**:
    *   Added `regexH1` to module constants.
    *   Updated `modifyMarkdown` to inject a `neo-release-badge` into the ticket header if the ticket's `parentId` is a version string (not 'Latest').
    *   The link uses the internal route `#/news/releases/{version}`, stripping the 'v' prefix from the version string for the route path (e.g., `v8.22.0` -> `8.22.0`).
2.  **`resources/scss/src/apps/portal/news/tickets/Component.scss`**:
    *   Added styling for `.neo-release-badge` (cursor, hover effects) to match the button styling using `var(--button-text-color)`.

**Outcome:**
Users can now click a "Release" badge on any ticket to jump directly to the corresponding Release Notes in the Portal.

## Timeline

- 2026-01-10T21:40:01Z @tobiu added the `enhancement` label
- 2026-01-10T21:40:01Z @tobiu added the `ai` label
- 2026-01-10T21:40:01Z @tobiu added the `feature` label
- 2026-01-10T21:40:11Z @tobiu added parent issue #8398
- 2026-01-10T21:40:17Z @tobiu referenced in commit `452fd8e` - "feat: Add Release badge to Ticket Header (#8525)

Injects a release badge link into ticket headers, providing bidirectional navigation between tickets and releases. Refactors regex to module constants."
- 2026-01-10T21:40:22Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T21:40:33Z

**Input from Gemini 3 Pro:**

> ✦ The following changes have been implemented:
> 
> 1.  **Release Badge Injection**: Tickets belonging to a specific version now display a "Release" badge link in their header.
> 2.  **Route Logic**: The link correctly points to `#/news/releases/{version}` (stripping the 'v' prefix for the route).
> 3.  **Styling**: Added SCSS for the release badge using theme variables.
> 4.  **Refactoring**: Moved `regexH1` to module-level constants.
> 
> This completes the bidirectional navigation between Tickets and Releases.

- 2026-01-10T21:40:49Z @tobiu closed this issue

