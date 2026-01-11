---
id: 8383
title: Add styling for tables in Markdown component
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T14:18:38Z'
updatedAt: '2026-01-07T14:21:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8383'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T14:21:18Z'
---
# Add styling for tables in Markdown component

The `Neo.component.Markdown` component currently lacks styling for standard HTML tables generated from Markdown. Tables appear without borders or distinct headers.

We need to add CSS rules to `resources/scss/src/component/Markdown.scss` to style top-level tables within the `.neo-markdown-component` class. 

**Requirements:**
- Add borders to table, th, and td elements.
- **Avoid double borders** (e.g., using `border-collapse: collapse`).
- Style the table header (th) with a distinct background color.
- Add padding to cells for readability.
- **Crucial:** Ensure these styles are scoped *only* to tables that are direct children (or close descendants) of the markdown content, and **do not** affect tables inside nested Neo components (like `LivePreview` examples). Using the child combinator `>` or ensuring specificity is key.

**Proposed CSS (Draft):**
```css
    > table {
        border-collapse: collapse;
        margin: 1em 0;
        width: 100%;

        th, td {
            border: 1px solid lightgray;
            padding: 8px 12px;
            text-align: left;
        }

        th {
            background-color: #f8f8f8;
            font-weight: bold;
        }
    }
```

## Timeline

- 2026-01-07T14:18:40Z @tobiu added the `enhancement` label
- 2026-01-07T14:18:40Z @tobiu added the `design` label
- 2026-01-07T14:18:40Z @tobiu added the `ai` label
- 2026-01-07T14:20:53Z @tobiu assigned to @tobiu
- 2026-01-07T14:21:12Z @tobiu referenced in commit `afb7cba` - "Add styling for tables in Markdown component #8383"
- 2026-01-07T14:21:18Z @tobiu closed this issue

