---
id: 8516
title: Enhance markdown rendering for ticket sub-issues
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-01-10T19:16:25Z'
updatedAt: '2026-01-10T19:22:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8516'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T19:22:26Z'
---
# Enhance markdown rendering for ticket sub-issues

Update `apps/portal/view/news/tickets/Component.mjs` to custom render the `subIssues` frontmatter field.
- Render each sub-issue on a new line.
- Parse the issue ID and link it to `#/news/tickets/{id}`.
- This improves the usability of the Tickets section in the Portal.

## Timeline

- 2026-01-10T19:16:27Z @tobiu added the `enhancement` label
- 2026-01-10T19:16:27Z @tobiu added the `ai` label
- 2026-01-10T19:16:27Z @tobiu added the `feature` label
- 2026-01-10T19:21:47Z @tobiu referenced in commit `f7426ad` - "feat: Enhance ticket sub-issues rendering in Portal (#8516)

- Override frontMatterToHtml in Portal.view.news.tickets.Component
- Render subIssues as a list with internal links to #/news/tickets/{id}
- Use <br> separation for better readability"
- 2026-01-10T19:21:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T19:22:08Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the custom `frontMatterToHtml` method in `apps/portal/view/news/tickets/Component.mjs`.
> 
> The `subIssues` field in the frontmatter is now detected and rendered specially:
> - Each item is displayed on a new line.
> - The issue ID (4+ digits) is converted into an internal link: `#/news/tickets/{id}`.
> - Other frontmatter fields continue to use the default rendering logic.
> 
> Verified that this aligns with the routing logic in `MainContainerController.mjs`.

- 2026-01-10T19:22:27Z @tobiu closed this issue

