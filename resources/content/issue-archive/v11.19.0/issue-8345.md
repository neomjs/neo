---
id: 8345
title: Fix Shebang Parsing in SourceParser
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T00:06:30Z'
updatedAt: '2026-01-06T00:26:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8345'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T00:26:51Z'
---
# Fix Shebang Parsing in SourceParser

`SourceParser` fails to parse files starting with a shebang (`#!/usr/bin/env node`) with `Unexpected character '!'`.
**Fix:** Strip the shebang line before passing content to `acorn`.

## Timeline

- 2026-01-06T00:06:31Z @tobiu added the `bug` label
- 2026-01-06T00:06:31Z @tobiu added the `ai` label
- 2026-01-06T00:11:01Z @tobiu assigned to @tobiu
- 2026-01-06T00:26:03Z @tobiu referenced in commit `8a09e7f` - "Bugfix: Fix Shebang Parsing in SourceParser #8345

SourceParser now strips the shebang line ('#!...') before passing content to Acorn, preventing syntax errors when indexing executable scripts (e.g. CLI tools, test runners)."
### @tobiu - 2026-01-06T00:26:09Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to `SourceParser.mjs`. It now checks for and strips the shebang line (`#!...`) before attempting to parse the content with `acorn`. This ensures that executable scripts in the `ai/` and `buildScripts/` directories are correctly indexed without syntax errors.

- 2026-01-06T00:26:52Z @tobiu closed this issue

