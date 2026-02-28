---
id: 8920
title: 'Feat: Implement Neo.component.markdown.VDom (VDOM-Native Parsing)'
state: OPEN
labels:
  - ai
  - feature
assignees: []
createdAt: '2026-01-31T14:12:54Z'
updatedAt: '2026-01-31T14:12:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8920'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 8921 Feat: Implement Neo.ai.Chat (Reference UI)'
---
# Feat: Implement Neo.component.markdown.VDom (VDOM-Native Parsing)

Create a new Markdown component that compiles markdown source directly into a Neo.mjs VDOM tree, bypassing `innerHTML` and the `marked` library.

**Architecture:**
- **Input:** Markdown string (or stream).
- **Output:** Pure VDOM Tree (e.g., `{tag: 'p', cn: [{vtype: 'text', html: 'Hello'}]}`).
- **Parser:** A lightweight, custom parser running in the App Worker.

**Benefits:**
1.  **Delta Updates:** Enables fine-grained DOM patching for streaming content (LLM responses).
2.  **Security:** Eliminates XSS risks associated with `innerHTML`.
3.  **Performance:** Avoids full DOM trashing on every character append.

## Timeline

- 2026-01-31T14:12:55Z @tobiu added the `ai` label
- 2026-01-31T14:12:55Z @tobiu added the `feature` label
- 2026-01-31T14:13:24Z @tobiu marked this issue as being blocked by #8921
- 2026-01-31T14:15:36Z @tobiu removed the block by #8921
- 2026-01-31T14:16:33Z @tobiu marked this issue as blocking #8921

