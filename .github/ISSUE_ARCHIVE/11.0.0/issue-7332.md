---
id: 7332
title: Enhance Session Summary with Rich Metadata
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T08:41:27Z'
updatedAt: '2025-10-03T08:42:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7332'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-03T08:42:41Z'
---
# Enhance Session Summary with Rich Metadata

**Reported by:** @tobiu on 2025-10-03

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

The `buildScripts/ai/summarizeSession.mjs` script should be enhanced to extract more detailed, structured metadata from each agent session. This will allow for better filtering, analysis, and learning from past sessions.

### The Problem

Currently, the session summary is a block of text. While useful, it is difficult to programmatically query or filter sessions based on their quality, outcome, or complexity.

### The Solution

The summarization prompt sent to the generative model will be updated to request a JSON object containing the summary along with several key metrics.

**New Data Structure:**

The model will be asked to provide a JSON object with the following structure:

```json
{
  "summary": "A detailed summary of the session's events...",
  "title": "A concise, descriptive title for the session.",
  "category": "bugfix | feature | refactoring | documentation | new-app | etc.",
  "quality": "A score (0-100) rating the session's flow and focus.",
  "productivity": "A score (0-100) indicating if the session's goals were achieved.",
  "impact": "A score (0-100) estimating the significance of the changes made.",
  "complexity": "A score (0-100) rating the task's complexity based on factors like file touchpoints, depth of changes (core vs. app-level), and cognitive load. A simple typo fix is < 10. A deep refactoring of a core module is > 90.",
  "technologies": ["neo.mjs", "chromadb", "nodejs"]
}
```

**Implementation Steps:**

1.  **Update Prompt:** Modify the `summaryPrompt` in `buildScripts/ai/summarizeSession.mjs` to instruct the model to return the data in the specified JSON format.
2.  **Parse Response:** Parse the JSON response from the model.
3.  **Store Metadata:** Add the new fields (`title`, `category`, `quality`, `productivity`, `impact`, `complexity`, `technologies`) to the `metadatas` object being upserted into the `sessionsCollection`. The `summary` text will remain the main document content.

