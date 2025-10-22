---
id: 7136
title: 'Alternative Dev Mode: In-Worker Parsing with `parse5`'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T07:02:49Z'
updatedAt: '2025-07-31T10:24:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7136'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-31T10:24:46Z'
---
# Alternative Dev Mode: In-Worker Parsing with `parse5`

**Reported by:** @tobiu on 2025-07-31

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

**Description:**
As an alternative to the main thread addon, we will evaluate using `parse5` directly within the App worker for dev mode. This approach avoids the complexities and potential race conditions of an asynchronous worker roundtrip for parsing. While it introduces a ~176KB dependency to the dev build, this cost may be acceptable for the significant gain in architectural simplicity and rendering predictability.

**Implementation Details:**
- **Tool:** `parse5`
- **Method:**
    1. Create a new `HtmlTemplateProcessor` utility inside the app worker (`src/util/HtmlTemplateProcessor.mjs` or similar).
    2. This processor will be lazy-loaded when a component first uses an HTML template.
    3. The processor will use `parse5` to synchronously convert the template string into a Neo.mjs VDOM JSON structure.
    4. The component's lifecycle (`continueUpdateWithVdom` for functional, a new hook for class-based) will then proceed synchronously with the parsed VDOM.
    5. The existing main thread addon (`Neo.main.addon.HtmlStringToVdom`) and its tests will be kept for comparison and potential future use cases.

