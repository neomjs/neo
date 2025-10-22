---
id: 7217
title: 'AI Knowledge Base: Exclude learn/comparisons'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-20T08:37:02Z'
updatedAt: '2025-09-20T08:44:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7217'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-20T08:44:42Z'
---
# AI Knowledge Base: Exclude learn/comparisons

**Reported by:** @tobiu on 2025-09-20

The AI knowledge base query results are polluted by the `learn/comparisons` folder.

We should exclude this folder from the knowledge base creation process.

This can be done by updating `buildScripts/ai/createKnowledgeBase.mjs` to ignore this path.

## Comments

### @tobiu - 2025-09-20 08:44

```bash
tobiasuhlig@iMacPro neo % npm run ai:query -- -q "Tell me about reactivity"

> neo.mjs@10.6.0 ai:query
> node buildScripts/ai/queryKnowledgeBase.mjs -q Tell me about reactivity

Querying for: "Tell me about reactivity"...

Most relevant source files (by weighted score):
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-reactivity.md (Score: 3219)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/Records.md (Score: 440)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/Collections.md (Score: 315)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-state-provider.md (Score: 307)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ConfigSystemDeepDive.md (Score: 275)
- /Users/Shared/github/neomjs/neo/learn/guides/datahandling/StateProviders.md (Score: 209)
- /Users/Shared/github/neomjs/neo/learn/Glossary.md (Score: 94)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/DeclarativeComponentTreesVsImperativeVdom.md (Score: 80)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-post1-love-story.md (Score: 73)
- /Users/Shared/github/neomjs/neo/learn/guides/fundamentals/ExtendingNeoClasses.md (Score: 64)
- /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-functional-components.md (Score: 47)
- /Users/Shared/github/neomjs/neo/learn/guides/userinteraction/events/CustomEvents.md (Score: 37)
- /Users/Shared/github/neomjs/neo/learn/guides/uibuildingblocks/CustomComponents.md (Score: 36)
- /Users/Shared/github/neomjs/neo/src/core/Base.mjs (Score: 35)
- /Users/Shared/github/neomjs/neo/learn/gettingstarted/References.md (Score: 31)
- /Users/Shared/github/neomjs/neo/src/core/Effect.mjs (Score: 11)

Top result: /Users/Shared/github/neomjs/neo/learn/blog/v10-deep-dive-reactivity.md
```

