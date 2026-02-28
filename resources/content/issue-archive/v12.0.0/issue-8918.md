---
id: 8918
title: 'Markdown Component: Support links in headlines'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-31T01:32:26Z'
updatedAt: '2026-01-31T01:33:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8918'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T01:33:54Z'
---
# Markdown Component: Support links in headlines

The `Neo.component.Markdown` class uses a custom `modifyMarkdown` method to intercept and format headlines (`#`, `##`, `###`) with custom classes (e.g., `class="neo-h1"`).

However, the `onHeadline` method currently only supports inline code replacement. It does not parse markdown links (`[text](url)`). Because this custom parsing happens **before** the content is passed to `marked.parse`, and because `marked` preserves HTML blocks, links inside headlines are rendered as raw text.

**Example:**
`### [My Link](url)` renders as `<h3>[My Link](url)</h3>` instead of `<h3><a href="url">My Link</a></h3>`.

**Proposed Fix:**
Update `src/component/Markdown.mjs` to include a regex replacement for markdown links within the `onHeadline` method.

**Location:** `src/component/Markdown.mjs` -> `onHeadline()`

## Timeline

- 2026-01-31T01:32:27Z @tobiu added the `bug` label
- 2026-01-31T01:32:27Z @tobiu added the `ai` label
### @tobiu - 2026-01-31T01:33:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix in `src/component/Markdown.mjs`. The `onHeadline` method now includes a regex replacement for markdown links `[text](url)`, ensuring they are correctly rendered as anchor tags within the custom headline elements.
> 
> Commit: 51d9238b7

- 2026-01-31T01:33:41Z @tobiu assigned to @tobiu
- 2026-01-31T01:33:54Z @tobiu closed this issue

