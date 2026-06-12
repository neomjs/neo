---
id: 7650
title: 'Feat: Enhance Local Issue Tickets with GitHub Timeline Events and Related Commits'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T17:29:01Z'
updatedAt: '2025-11-13T11:55:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7650'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T11:52:40Z'
---
# Feat: Enhance Local Issue Tickets with GitHub Timeline Events and Related Commits

This ticket proposes an enhancement to the local issue synchronization process to include more comprehensive information from GitHub issues, specifically timeline events and related commits. This will provide a richer and more complete historical context within the local Markdown issue files.

**Motivation:**
GitHub issue pages display a wealth of information beyond just the issue description and comments, including:
*   Assignment changes (self-assigned, unassigned)
*   Label additions/removals
*   Parent/sub-issue relationships
*   References to commits (even without a direct PR link, e.g., via commit messages containing issue IDs)
*   Issue state changes (opened, closed, reopened)

Currently, our local Markdown tickets only capture a subset of this information. Integrating these timeline events and related commits will make the local tickets more self-contained and valuable for understanding the full history and context of an issue without needing to constantly refer back to GitHub.

**Proposed Changes:**

1.  **Extend GraphQL Queries:**
    *   Modify the `FETCH_ISSUES_FOR_SYNC` query in `issueQueries.mjs` to fetch `timelineItems` (including events like `AssignedEvent`, `LabeledEvent`, `ClosedEvent`, `ReferencedEvent` for commits/PRs) and potentially `linkedPullRequests` with their associated commit details.

2.  **Update `#formatIssueMarkdown` Method:**
    *   Enhance the `#formatIssueMarkdown` method in `IssueSyncer.mjs` to parse and format the newly fetched timeline events and commit information.
    *   Introduce new sections within the Markdown body (e.g., "Activity Log" or "Related Commits") to present this information clearly and chronologically.

This enhancement will significantly improve the utility and completeness of our local issue tracking.

## Timeline

- 2025-10-25T17:29:02Z @tobiu added the `enhancement` label
- 2025-10-25T17:29:02Z @tobiu added the `ai` label
- 2025-10-25T17:29:17Z @tobiu assigned to @tobiu
- 2025-11-13T11:41:07Z @tobiu referenced in commit `c3e914d` - "Feat: Enhance Local Issue Tickets with GitHub Timeline Events and Related Commits #7650"
- 2025-11-13T11:52:17Z @tobiu referenced in commit `473f287` - "#7650 full ticket re-sync to get activity logs"
- 2025-11-13T11:52:40Z @tobiu closed this issue
### @tobiu - 2025-11-13T11:55:57Z

@MannXo you might like this one:

<img width="891" height="1290" alt="Image" src="https://github.com/user-attachments/assets/0fabc71c-b421-4b64-8674-632194cfaaad" />


