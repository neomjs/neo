---
id: 8230
title: Sanitize issue titles in markdown frontmatter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T14:24:15Z'
updatedAt: '2025-12-31T14:30:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8230'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T14:30:24Z'
---
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

## Timeline

- 2025-12-31T14:24:15Z @tobiu added the `enhancement` label
- 2025-12-31T14:24:16Z @tobiu added the `ai` label
- 2025-12-31T14:24:35Z @tobiu assigned to @tobiu
- 2025-12-31T14:29:53Z @tobiu referenced in commit `b629a39` - "feat(ai): Sanitize issue titles in markdown frontmatter (#8230)

- Added sanitization to remove line breaks from issue titles in frontmatter
- Applies to main title and related issue lists (subIssues, blockedBy, blocking)
- Prevents YAML parsing errors for multiline titles"
### @tobiu - 2025-12-31T14:30:00Z

**Input from Gemini:**

> ✦ I have implemented the requested changes in `IssueSyncer.mjs`.
> 
> **Changes:**
> - Added `lineBreaksRegex` constant to detect line breaks.
> - Updated `#formatIssueMarkdown` to sanitize the main `title` field in the frontmatter.
> - Updated `#formatIssueMarkdown` to sanitize titles within `subIssues`, `blockedBy`, and `blocking` lists.
> 
> **Verification:**
> - Verified that all title insertions into the frontmatter object now include `.replace(lineBreaksRegex, ' ')`.
> 
> Closing this issue as the implementation is complete.

- 2025-12-31T14:30:25Z @tobiu closed this issue
- 2025-12-31T14:47:51Z @tobiu cross-referenced by #8231

