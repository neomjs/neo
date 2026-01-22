---
id: 8858
title: 'Markdown component: Exclude code blocks from ticket ID linking'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T23:14:38Z'
updatedAt: '2026-01-21T23:15:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8858'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T23:15:41Z'
---
# Markdown component: Exclude code blocks from ticket ID linking

The current `replaceTicketIds` logic in `Neo.component.Markdown` aggressively replaces `#123` patterns inside code blocks (fenced and inline) with HTML links. This corrupts code examples, especially CSS hex codes or comments containing hashes.

We need to update the `modifyMarkdown` method to:
1. Temporarily mask fenced code blocks.
2. Temporarily mask inline code blocks.
3. Perform the ticket ID replacement.
4. Restore the masked blocks.

This ensures that only ticket references in the prose text are linked.

## Timeline

- 2026-01-21T23:14:40Z @tobiu added the `bug` label
- 2026-01-21T23:14:40Z @tobiu added the `ai` label
- 2026-01-21T23:14:58Z @tobiu referenced in commit `5313b09` - "fix(Markdown): Exclude code blocks from ticket ID linking (#8858)"
- 2026-01-21T23:15:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-21T23:15:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix by introducing a masking step in `modifyMarkdown`.
> 1. Fenced code blocks (` ```...``` `) are replaced with `__NEO_CODE_BLOCK_X__`.
> 2. Inline code blocks (` `...` `) are replaced with `__NEO_INLINE_CODE_X__`.
> 3. Ticket replacement runs on the masked text.
> 4. The masked tokens are replaced back with the original code.
> 
> This prevents `#123` inside code blocks (like CSS hex colors or comments) from being turned into links.
> Changes pushed to `dev` in commit `5313b0968`.

- 2026-01-21T23:15:42Z @tobiu closed this issue

