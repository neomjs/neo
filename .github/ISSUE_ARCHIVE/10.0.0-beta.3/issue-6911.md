---
id: 6911
title: >-
  Portal.view.learn.ContentComponent: processReadonlyCodeBlocks() => styling for
  code blocks inside lists
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-30T15:30:27Z'
updatedAt: '2025-06-30T15:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6911'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-30T15:32:37Z'
---
# Portal.view.learn.ContentComponent: processReadonlyCodeBlocks() => styling for code blocks inside lists

**Reported by:** @tobiu on 2025-06-30

The current regex cuts off blank chars before a code block starts:

```javascript
regexReadonly = /```(javascript|html|css|json)\s+readonly\s*\n([\s\S]*?)\n\s*```/g;
```

We could change this via

```javascript
regexReadonly = /\s*```(javascript|html|css|json)\s+readonly\s*\n([\s\S]*?)\n\s*```/g;
```

but then the highlightJS parser does weird things and adds p tags into the converted code.

Currently it looks like:

<img width="846" alt="Image" src="https://github.com/user-attachments/assets/b3285ea8-646f-459e-a51e-761cd94c4f7c" />

I have a more effective fix in mind.

## Comments

### @tobiu - 2025-06-30 15:32

<img width="845" alt="Image" src="https://github.com/user-attachments/assets/5c8187e7-0278-40b1-ac38-cc27279f1b35" />

