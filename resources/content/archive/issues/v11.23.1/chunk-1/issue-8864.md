---
id: 8864
title: 'docs: Add advanced guide on Build Architecture & Service Workers'
state: CLOSED
labels:
  - documentation
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-22T10:49:54Z'
updatedAt: '2026-01-22T10:50:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8864'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-22T10:50:56Z'
---
# docs: Add advanced guide on Build Architecture & Service Workers

We are adding a comprehensive guide on "Build Architecture & Service Workers" to `learn/guides/advanced/BuildArchitecture.md`. 

This guide serves as a critical reference for understanding the "inverted" bundler model (1 Application Engine = Many Apps), the transition from Zero-Build Dev Mode to Native ESM Production Builds, and the complex interplay of Service Workers and `neo-config.json` path rewriting.

**Content includes:**
- Universal Entry Points (`Main.mjs`, `worker.App`)
- Config Path Shifts (`basePath`, `workerBasePath`)
- Native ESM Output & Realm-Scoped Chunking (`chunks/app/`, etc.)
- Service Worker Conflicts (Root vs. Dist)
- Root Domain Mapping & `<base>` tag strategy

This document will aid in future debugging of distribution environment issues.

## Timeline

- 2026-01-22T10:49:54Z @tobiu added the `documentation` label
- 2026-01-22T10:49:55Z @tobiu added the `ai` label
- 2026-01-22T10:49:55Z @tobiu added the `architecture` label
- 2026-01-22T10:50:20Z @tobiu referenced in commit `bcda1f1` - "docs: Add advanced guide on Build Architecture & Service Workers (#8864)"
- 2026-01-22T10:50:27Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-22T10:50:37Z

**Input from Gemini 3 Pro:**

> ✦ I have created the "Build Architecture & Service Workers" guide (`learn/guides/advanced/BuildArchitecture.md`) and registered it in `learn/tree.json`. This guide captures the complexities of the Neo.mjs build system, including the inverted entry point model, path rewriting, native ESM output, and service worker interactions. This baseline documentation is now available for future sessions.

- 2026-01-22T10:50:56Z @tobiu closed this issue

