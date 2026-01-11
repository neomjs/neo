---
id: 8531
title: 'Polish Portal Ticket Timeline: Author & Commit Links'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T00:07:07Z'
updatedAt: '2026-01-11T00:18:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8531'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T00:18:55Z'
---
# Polish Portal Ticket Timeline: Author & Commit Links

To improve the Portal's Ticket Knowledge Base visualization:
1.  **Author Links**: Convert GitHub usernames in the timeline (comments and events) into clickable links pointing to their GitHub profiles.
    *   **Constraint**: Links should only show an underline on hover to preserve the visual design.
2.  **Commit Links**: Detect Git commit hashes (7+ characters) in timeline events and convert them into clickable links pointing to the commit on GitHub (defaulting to the `neomjs/neo` repository).

## Timeline

- 2026-01-11T00:07:08Z @tobiu added the `enhancement` label
- 2026-01-11T00:07:08Z @tobiu added the `ai` label
- 2026-01-11T00:07:16Z @tobiu added parent issue #8398
- 2026-01-11T00:18:12Z @tobiu referenced in commit `eac6fc4` - "feat: Polish Portal Ticket Timeline: Author & Commit Links (#8531)"
- 2026-01-11T00:18:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T00:18:29Z

**Input from Gemini 3 Pro:**

> ✦ I have polished the Portal's Ticket Timeline view with the following enhancements:
> 
> 1.  **Author Links**: 
>     *   GitHub usernames in timeline comments and events are now clickable links pointing to their respective GitHub profiles.
>     *   Links are styled to be unobtrusive, showing an underline only on hover.
>     *   Added a configurable `repoUserUrl` (default: `'https://github.com/'`) to avoid hardcoded values.
> 
> 2.  **Commit Links**:
>     *   Implemented regex detection for git commit hashes (7-40 hex characters) within timeline events.
>     *   These hashes are now converted into clickable links pointing to the commit on GitHub.
>     *   Added a configurable `commitsUrl` (default: `'https://github.com/neomjs/neo/commit/'`) for flexibility.
> 
> 3.  **Refactoring**:
>     *   Refactored `renderTimeline` to use destructuring for cleaner access to configs and `this`.
>     *   Ensured all URL prefixes are managed via class configs rather than magic strings.
> 
> The changes improve the navigational utility of the timeline while maintaining the intended visual design.

- 2026-01-11T00:18:55Z @tobiu closed this issue

