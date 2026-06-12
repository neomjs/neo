---
id: 8384
title: Add rounded corners to Markdown tables
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T14:21:24Z'
updatedAt: '2026-01-07T14:23:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8384'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T14:23:45Z'
---
# Add rounded corners to Markdown tables

To match the code blocks, tables in `Neo.component.Markdown` should have a `4px` border radius.

Since `border-collapse: collapse` prevents `border-radius` from working, we should switch to `border-collapse: separate` with `border-spacing: 0`.

**Proposed CSS Update:**
Modify `resources/scss/src/component/Markdown.scss`:

```css
    > table {
        border         : 1px solid lightgray;
        border-collapse: separate;
        border-radius  : 4px;
        border-spacing : 0;
        margin         : 1em 0;
        overflow       : hidden;
        width          : 100%;

        th, td {
            border-bottom: 1px solid lightgray;
            border-right : 1px solid lightgray;
            padding      : 8px 12px;
            text-align   : left;
        }

        /* Prevent double borders on the right edge */
        th:last-child, 
        td:last-child {
            border-right: none;
        }

        /* Prevent double borders on the bottom edge */
        tr:last-child td {
            border-bottom: none;
        }

        th {
            background-color: #f8f8f8;
            font-weight     : bold;
        }
    }
```

## Timeline

- 2026-01-07T14:21:25Z @tobiu added the `enhancement` label
- 2026-01-07T14:21:25Z @tobiu added the `design` label
- 2026-01-07T14:21:25Z @tobiu added the `ai` label
- 2026-01-07T14:21:33Z @tobiu assigned to @tobiu
- 2026-01-07T14:23:28Z @tobiu referenced in commit `c3c63d7` - "Add rounded corners to Markdown tables #8384"
- 2026-01-07T14:23:46Z @tobiu closed this issue

