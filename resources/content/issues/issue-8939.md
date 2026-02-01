---
id: 8939
title: 'Feat: Country Flag Column'
state: OPEN
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T16:44:01Z'
updatedAt: '2026-02-01T16:44:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8939'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Country Flag Column

This task focuses on adding a column to display the contributor's country flag.

### Requirements
1.  **Data Processing:** Parse the `location` field (e.g., "Berlin, Germany") to extract a Country Code (e.g., "DE").
    *   *Note:* This might require a small lookup map or a heuristic in the JSON generator or the Model.
2.  **Grid Column:** Add a "Country" column.
3.  **Renderer:** Render the flag emoji (e.g., 🇩🇪) or an SVG icon based on the country code.

### Acceptance Criteria
- The grid displays a flag for users with resolvable locations.


## Timeline

- 2026-02-01T16:44:02Z @tobiu added the `enhancement` label
- 2026-02-01T16:44:02Z @tobiu added the `design` label
- 2026-02-01T16:44:12Z @tobiu added parent issue #8930
- 2026-02-01T16:44:51Z @tobiu assigned to @tobiu

