---
id: 6663
title: 'main.DomEvents: getEventData() => include aria attributes'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-04-16T22:14:48Z'
updatedAt: '2025-04-17T10:55:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6663'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-17T10:55:46Z'
---
# main.DomEvents: getEventData() => include aria attributes

while there is sadly no `ariaSet` equivalent to the `dataSet`, it can be useful to include these attributes to check for e.g. `aria-rowindex` inside a buffered grid click event.

We would need something like:
```
function getAllAriaAttributes(node) {
  const ariaAttributes = {};
  const attributes = node.attributes;

  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    if (attribute.name.startsWith('aria-')) {
      ariaAttributes[attribute.name] = attribute.value;
    }
  }

  return ariaAttributes;
}
```

## Timeline

- 2025-04-16T22:14:48Z @tobiu added the `enhancement` label
- 2025-04-16T22:29:28Z @tobiu cross-referenced by #6664
- 2025-04-17T10:55:38Z @tobiu referenced in commit `e669a05` - "main.DomEvents: getEventData() => include aria attributes #6663"
- 2025-04-17T10:55:46Z @tobiu closed this issue

