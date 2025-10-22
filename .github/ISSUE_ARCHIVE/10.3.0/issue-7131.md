---
id: 7131
title: 'Dev Mode: Main Thread Addon for Live Parsing'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-30T11:01:35Z'
updatedAt: '2025-08-02T12:58:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7131'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T12:58:06Z'
---
# Dev Mode: Main Thread Addon for Live Parsing

**Reported by:** @tobiu on 2025-07-30

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
For development mode, we need an addon that can parse these HTML string templates on the fly within the browser. This allows for rapid development and testing without requiring a build step after every change.

**Implementation Details:**
- **Name:** `Neo.main.addon.HtmlStringToVdom`
- **Method:**
    1. Use the native `DOMParser` to convert the HTML string into a standard DOM tree.
    2. Traverse the generated DOM tree and map it to a JSON structure that matches the Neo.mjs VDOM format.
    3. Ensure that any embedded logic or dynamic values from the template literal are correctly placed within the resulting VDOM for later processing by the framework.

## Comments

### @tobiu - 2025-08-02 12:58

**Status:** Dropped

**Reason:** This approach was superseded by the in-worker parsing strategy (Sub-Task 4). The main thread addon would require an inefficient and slow worker roundtrip for parsing, while the in-worker approach is synchronous and significantly more performant for the zero-builds development mode. The addon and its related tests have been deleted to simplify the codebase.


