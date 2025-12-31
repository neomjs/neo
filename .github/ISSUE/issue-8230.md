---
id: 8230
title: Sanitize issue titles in markdown frontmatter
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-31T14:24:15Z'
updatedAt: '2025-12-31T14:24:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8230'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Sanitize issue titles in markdown frontmatter

# Sanitize issue titles in markdown frontmatter

As identified in the follow-up to #8229, some GitHub issue titles contain line breaks (e.g., #6941). This can break the YAML frontmatter structure, both for the main `title` field and when titles are included in `subIssues`, `blockedBy`, or `blocking` lists.

**Goal:**
Ensure all titles used in the markdown frontmatter (main title and list items) are sanitized to be single-line strings.

**Implementation:**
- Update `IssueSyncer.mjs`.
- Define a regex at the top of the module to capture line breaks (`/[\r\n]+/g`).
- Apply this sanitization to:
    - The main issue `title`.
    - The titles used in `subIssues`, `blockedBy`, and `blocking` lists.

**Example Transformation:**
Original Title:
"Implement Class-Aware Merging\nReplacement"

Sanitized Title:
"Implement Class-Aware Merging Replacement"

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label

