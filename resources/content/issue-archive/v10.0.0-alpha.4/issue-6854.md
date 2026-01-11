---
id: 6854
title: resources/data/deck/learnneo => learn/
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-22T20:43:53Z'
updatedAt: '2025-10-22T22:55:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6854'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-22T20:46:25Z'
---
# resources/data/deck/learnneo => learn/

Let me first explore the current structure of the learning content to understand how it's organized and accessed. Based on your question about whether moving the learning content from `resources/data/deck/learnneo` to a top-level folder like `learn` or `guides` would help LLMs better access it for training data, here's my analysis:

## Yes, it would likely help for several reasons:

### **1. Discoverability & Crawling**
- **Top-level visibility**: Content in root-level directories like or `/guides` is more easily discovered by web crawlers and automated systems that index repositories `/learn`
- **Standard conventions**: Many projects use top-level directories like `docs/`, `guides/`, `tutorials/`, or for documentation, making it a recognizable pattern for LLMs `learn/`

### **2. Path Semantics**
- The current path `resources/data/deck/learnneo/pages/` is deeply nested and less semantically clear
- A path like or `/guides/` immediately signals educational content to both humans and automated systems `/learn/`

### **3. Repository Structure Best Practices**
Looking at your current structure, you already have top-level directories like:
- `docs/` (likely for API documentation)
- (for code examples) `examples/`

Adding would follow this established pattern and create better organization. `/learn/`
### **4. Web Accessibility**
Since the content is accessible via `#/learn` on your website, having the source files in a directory would create better alignment between the URL structure and the repository structure. `/learn`
## Recommendation:
**Move to `/learn/`** rather than `/guides/` because:
- It matches your existing URL structure (`#/learn`)
- It's more inclusive (covers tutorials, guides, getting started, etc.)
- It's shorter and more memorable

The structure could become:
``` 
/learn/
  ├── benefits/
  ├── getting-started/
  ├── tutorials/
  ├── guides/
  ├── javascript/
  ├── Glossary.md
  └── UsingTheseTopics.md
```
This would make your learning content much more discoverable for LLM training while maintaining the same organizational structure within the moved directory.

## Timeline

- 2025-06-22T20:43:53Z @tobiu assigned to @tobiu
- 2025-06-22T20:43:54Z @tobiu added the `enhancement` label
- 2025-06-22T20:45:45Z @tobiu referenced in commit `52db3f7` - "resources/data/deck/learnneo => learn/ #6854"
### @tobiu - 2025-06-22T20:46:25Z

FYI: the portal app has legacy support. it can still pull in the trainings deck from its old location if needed.

- 2025-06-22T20:46:25Z @tobiu closed this issue

