---
id: 8417
title: Refine RAG System Prompt for Identity & Accuracy
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T10:52:43Z'
updatedAt: '2026-01-08T10:56:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8417'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T10:56:11Z'
---
# Refine RAG System Prompt for Identity & Accuracy

The current RAG prompt allows the model to slip into generic training data, referring to the framework as "Neo.js" instead of "Neo.mjs".
We need to harden the system prompt in `SearchService.mjs`:
1. Explicitly enforce the "Neo.mjs" name.
2. Emphasize that it is a worker-based, multi-threaded framework (grounding context).
3. Re-verify with `test_rag.mjs`.

## Timeline

- 2026-01-08T10:52:45Z @tobiu added the `enhancement` label
- 2026-01-08T10:52:45Z @tobiu added the `ai` label
- 2026-01-08T10:54:31Z @tobiu referenced in commit `e34f0d4` - "fix: Harden RAG prompt to enforce Neo.mjs terminology (#8417)"
- 2026-01-08T10:54:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T10:54:43Z

**Input from Gemini 3 Pro:**

> ✦ Refined the system prompt in `SearchService.mjs` to strictly enforce "Neo.mjs" terminology.
> Verified with `test_rag.mjs` that the model now correctly refers to the framework as "Neo.mjs" instead of "Neo.js".

### @tobiu - 2026-01-08T10:55:47Z

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ✓  Shell node ai/examples/test_rag.mjs [current working directory /Users/Shared/github/neomjs/neo]                                                              │
│                                                                                                                                                                 │
│ 🔍 Testing RAG Service...                                                                                                                                       │
│ ⏳ Waiting for service to be ready...                                                                                                                           │
│ [2026-01-08T10:53:58.222Z] [INFO] Connected to Neural Link Bridge as agent-733af1cc-39e9-4332-ae98-4a173ad16b02                                                 │
│ ✅ Service Ready                                                                                                                                                │
│                                                                                                                                                                 │
│ ❓ Asking: "How do I use the Viewport component?"                                                                                                               │
│                                                                                                                                                                 │
│ 📝 Answer:                                                                                                                                                      │
│ To use the Viewport component, you import it and then assign it as the `mainView` configuration property when initializing a Neo.mjs application.               │
│                                                                                                                                                                 │
│ For example, as seen in `DOCUMENT 1 (examples/component/helix/app.mjs)`, `DOCUMENT 2 (examples/component/multiWindowHelix/childapp/app.mjs)`, and `DOCUMENT 3   │
│ (examples/component/coronaGallery/app.mjs)`:                                                                                                                    │
│                                                                                                                                                                 │
│ 1.  **Import the Viewport component:**                                                                                                                          │
│     `import Viewport from './Viewport.mjs';`                                                                                                                    │
│ 2.  **Assign it as the `mainView` in `Neo.app()`:**                                                                                                             │
│     `export const onStart = () => Neo.app({ mainView: Viewport, name: '...' });`                                                                                │
│                                                                                                                                                                 │
│ This sets the Viewport as the primary view for your Neo.mjs application.                                                                                        │
│                                                                                                                                                                 │
│ 📚 References:                                                                                                                                                  │
│    1. [0.4748] examples/component/helix/app.mjs - [Module Context] (examples/component/helix/app.mjs)                                                           │
│    2. [0.5043] examples/component/multiWindowHelix/childapp/app.mjs - [Module Context] (examples/component/multiWindowHelix/childapp/app.mjs)                   │
│    3. [0.5060] examples/component/coronaGallery/app.mjs - [Module Context] (examples/component/coronaGallery/app.mjs)                                           │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- 2026-01-08T10:56:11Z @tobiu closed this issue

