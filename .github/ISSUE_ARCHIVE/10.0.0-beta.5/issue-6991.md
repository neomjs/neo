---
id: 6991
title: >-
  test/siesta/tests/neo/MixinStaticConfig.mjs: add more complex testing
  scenarios
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T09:46:39Z'
updatedAt: '2025-07-09T09:47:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6991'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-09T09:47:26Z'
---
# test/siesta/tests/neo/MixinStaticConfig.mjs: add more complex testing scenarios

**Reported by:** @tobiu on 2025-07-09

* multiple mixins inside the hierarchy
* conflicting configs
* Neo.mjs => mixinProperty() needs a slight enhancement, to check to full proto parent chain, and not just the current proto.

## Comments

### @tobiu - 2025-07-09 09:47

<img width="810" height="660" alt="Image" src="https://github.com/user-attachments/assets/995b40f3-bb62-4a5f-bb63-f10dbaa87a7b" />

