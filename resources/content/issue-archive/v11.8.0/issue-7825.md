---
id: 7825
title: Fix JSON parsing in SessionService summarization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T19:38:50Z'
updatedAt: '2025-11-20T19:49:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7825'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T19:49:56Z'
---
# Fix JSON parsing in SessionService summarization

The `SessionService.summarizeSession` method fails to parse the LLM response if it includes Markdown code blocks (e.g. ` ```json `), causing a JSON parsing error during startup.

Error:
```
"error": "Unexpected token '', \"``json\n{\n\"... is not valid JSON"
```

Proposed Fix:
Strip Markdown code block delimiters from the response text before calling `JSON.parse()`.

## Timeline

- 2025-11-20T19:38:52Z @tobiu added the `bug` label
- 2025-11-20T19:38:52Z @tobiu added the `ai` label
- 2025-11-20T19:39:05Z @tobiu assigned to @tobiu
- 2025-11-20T19:49:33Z @tobiu referenced in commit `fa76c18` - "Fix JSON parsing in SessionService summarization #7825"
- 2025-11-20T19:49:56Z @tobiu closed this issue
- 2025-11-20T19:58:35Z @tobiu cross-referenced by #7826

