---
id: 7438
title: Create RMA Helper Scripts for Component Tests
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-10T16:48:55Z'
updatedAt: '2025-10-11T11:43:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7438'
author: tobiu
commentsCount: 3
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-11T08:40:35Z'
---
# Create RMA Helper Scripts for Component Tests

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

To facilitate communication between the Playwright test runner and the component instances in the app worker, a set of RMA (Remote Method Access) helper scripts is required. These scripts will be injected into the browser context using `page.addInitScript()`.

## Acceptance Criteria

1.  Create a new file, e.g., `test/playwright/util/rma-helpers.mjs`.
2.  This file should export the following asynchronous functions:
    -   `loadModule(path)`: A wrapper around `Neo.worker.App.loadModule({path})`.
    -   `createComponent(config)`: A wrapper around `Neo.worker.App.createNeoInstance()`.
    -   `destroyComponent(id)`: A wrapper around `Neo.worker.App.destroyNeoInstance()`.
    -   `getComponentConfig(id, keyOrKeys)`: A wrapper around `Neo.worker.App.getConfigs()`.
    -   `setComponentConfig(id, config)`: A wrapper around `Neo.worker.App.setConfigs()`.
3.  These helpers will be used in the `beforeEach`, `afterEach`, and test body sections of the component tests.

## Timeline

- 2025-10-10T16:48:57Z @tobiu added parent issue #7435
- 2025-10-10T16:48:57Z @tobiu added the `enhancement` label
- 2025-10-10T16:48:57Z @tobiu added the `help wanted` label
- 2025-10-10T16:48:58Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:48:58Z @tobiu added the `ai` label
### @Aki-07 - 2025-10-11T05:18:25Z

Would love to work on this please do assign me @tobiu

- 2025-10-11T05:21:31Z @Aki-07 cross-referenced by PR #7459
- 2025-10-11T08:40:35Z @tobiu closed this issue
- 2025-10-11T08:50:35Z @tobiu assigned to @Aki-07
### @tobiu - 2025-10-11T09:03:13Z

Let me add some more context what remote method access is all about, since this is one of my favorite topics. It simplifies cross-thread communication via using namespaces.

As an example, inside workers we can not access the live-DOM. When using e.g. CSS flexbox layouts, the virtual DOM abstraction layer does not know about the real sizes of DOM nodes inside of it. So, inside the app worker we can call:

```javascript
const buttonRect = await Neo.main.DomAccess.getBoundingClientRect({windowId, id});
```

`Neo.main.DomAccess` exists inside main threads, but not inside the app worker. An app worker can communicate with multiple browser windows (main threads), so we pass the `windowId` to get the right one. Under the hood, we send a postMessage from the app worker to main, execute the method, send the return value back and this resolves the Promise.

The real method definitions can be either sync or async, calling them from other threads is always async, due to the nature of post messages.

This concept also works for cross-worker communication, and workers are connected via MessageChannels for direct communication.

Code:
https://github.com/neomjs/neo/blob/dev/src/worker/mixin/RemoteMethodAccess.mjs
https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs#L569

### @tobiu - 2025-10-11T11:43:12Z

This one might be worth a read too:
https://github.com/neomjs/neo/blob/dev/learn/benefits/RPCLayer.md


