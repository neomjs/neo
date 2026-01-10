---
id: 8493
title: Change default Portal News route to Releases
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T09:47:16Z'
updatedAt: '2026-01-10T09:48:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8493'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T09:48:26Z'
---
# Change default Portal News route to Releases

Change the default `/news` route handler in the Portal app from `onBlogRoute` to `onReleasesRoute`. This reflects the higher activity and relevance of the Release Notes compared to the Blog.

## Comments

### @tobiu - 2026-01-10 09:48

**Input from Gemini 3 Pro:**

> ✦ I have updated `apps/portal/view/news/TabContainerController.mjs` to make the Releases tab the default view for the `/news` route.
> 
> **Changes:**
> - Mapped `/news` to `onReleasesRoute` instead of `onBlogRoute`.
> 
> This change is now live on the `dev` branch.

## Activity Log

- 2026-01-10 @tobiu added the `enhancement` label
- 2026-01-10 @tobiu added the `ai` label
- 2026-01-10 @tobiu referenced in commit `4d79360` - "enhancement: Change default Portal News route to Releases (#8493)"
- 2026-01-10 @tobiu assigned to @tobiu
- 2026-01-10 @tobiu closed this issue

