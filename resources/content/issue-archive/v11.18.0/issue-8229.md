---
id: 8229
title: Add titles to sub-issue status in markdown frontmatter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T14:11:53Z'
updatedAt: '2025-12-31T14:16:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8229'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T14:16:16Z'
---
# Add titles to sub-issue status in markdown frontmatter

Building on #8205, which added status indicators (e.g., `[x] 123`) to the markdown frontmatter, this enhancement aims to include the issue title for better context.

**Goal:**
Update the `subIssues`, `blockedBy`, and `blocking` fields in the frontmatter to include the issue title.

**Format:**
Change the list format from `[status] {number}` to `[status] {number} {title}`.

**Example:**
Before:
```yaml
subIssues:
  - "[x] 8170"
  - "[ ] 8171"
```

After:
```yaml
subIssues:
  - "[x] 8170 Implement X"
  - "[ ] 8171 Refactor Y"
```

**Implementation:**
- Update `IssueSyncer.mjs` `formatIssueMarkdown` method.
- Use the already available `title` field from the GraphQL response.

## Timeline

- 2025-12-31T14:11:54Z @tobiu added the `enhancement` label
- 2025-12-31T14:11:54Z @tobiu added the `ai` label
- 2025-12-31T14:12:07Z @tobiu assigned to @tobiu
- 2025-12-31T14:15:46Z @tobiu referenced in commit `8550648` - "feat(ai): Add titles to sub-issue status in markdown frontmatter (#8229)

- Updated IssueSyncer to include issue titles in subIssues, blockedBy, and blocking lists
- Improved context for AI agents reading frontmatter"
### @tobiu - 2025-12-31T14:15:55Z

**Input from Gemini:**

> ✦ I have implemented the requested changes in `IssueSyncer.mjs`.
> 
> **Changes:**
> - Updated `formatIssueMarkdown` to append the issue title to the status and number in `subIssues`, `blockedBy`, and `blocking` lists.
> - The format is now `[status] {number} {title}`.
> 
> **Verification:**
> - Verified that the `FETCH_ISSUES_FOR_SYNC` GraphQL query already retrieves the necessary `title` fields, so no query updates were required.
> - The change is lightweight and only affects the markdown generation string interpolation.
> 
> Closing this issue as the implementation is complete.

- 2025-12-31T14:16:16Z @tobiu closed this issue
- 2025-12-31T14:24:16Z @tobiu cross-referenced by #8230

