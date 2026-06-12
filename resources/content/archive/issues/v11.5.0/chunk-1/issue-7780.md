---
id: 7780
title: test/playwright/mcp/github-workflow/ghIntegrationGate.spec.mjs breaks testing suite
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-11-15T21:32:47Z'
updatedAt: '2025-11-18T08:55:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7780'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-15T21:34:26Z'
---
# test/playwright/mcp/github-workflow/ghIntegrationGate.spec.mjs breaks testing suite

@MannXo: i just re-ran the full testing suite via `npm test` and noticed:

```bash
/usr/local/bin/npm test

> neo.mjs@11.4.0 test
> playwright test -c test/playwright/playwright.config.mjs
[WebServer] <i> [webpack-dev-server] Project is running at:
[WebServer] <i> [webpack-dev-server] Loopback: http://localhost:8080/, http://[::1]:8080/
[WebServer] <i> [webpack-dev-server] On Your Network (IPv4): http://192.168.178.75:8080/
[WebServer] <i> [webpack-dev-server] On Your Network (IPv6): http://[fdf3:513e:29c0:0:c52:ab3c:4d9a:c1fd]:8080/
[WebServer] <i> [webpack-dev-server] Content not from webpack is served from '/Users/Shared/github/neomjs/neo' directory
[WebServer] <i> [webpack-dev-middleware] wait until bundle finished: /
[WebServer] <i> [webpack-dev-middleware] wait until bundle finished: /

SKIP: GH integration tests gated off (RUN_GH_INTEGRATION != true)

Process finished with exit code 0
```

=> using `process.exit(0)` breaks the entire harness. I will remove the 2 affected files for now, since they do not contain playwright based testing rules anyway.

## Timeline

- 2025-11-15T21:32:47Z @tobiu assigned to @tobiu
- 2025-11-15T21:32:48Z @tobiu added the `bug` label
- 2025-11-15T21:34:04Z @tobiu referenced in commit `2e43470` - "test/playwright/mcp/github-workflow/ghIntegrationGate.spec.mjs breaks testing suite #7780"
### @tobiu - 2025-11-15T21:34:26Z

```bash
/usr/local/bin/npm test

> neo.mjs@11.4.0 test
> playwright test -c test/playwright/playwright.config.mjs
[WebServer] <i> [webpack-dev-server] Project is running at:
[WebServer] <i> [webpack-dev-server] Loopback: http://localhost:8080/, http://[::1]:8080/
[WebServer] <i> [webpack-dev-server] On Your Network (IPv4): http://192.168.178.75:8080/
[WebServer] <i> [webpack-dev-server] On Your Network (IPv6): http://[fdf3:513e:29c0:0:c52:ab3c:4d9a:c1fd]:8080/
[WebServer] <i> [webpack-dev-server] Content not from webpack is served from '/Users/Shared/github/neomjs/neo' directory
[WebServer] <i> [webpack-dev-middleware] wait until bundle finished: /
[WebServer] <i> [webpack-dev-middleware] wait until bundle finished: /


Running 174 tests using 1 worker
  174 passed (17.8s)

Process finished with exit code 0
```

- 2025-11-15T21:34:26Z @tobiu closed this issue
### @MannXo - 2025-11-18T06:45:55Z

Thank you for informing me @tobiu 
I'll make sure to run the full testing suite going forward.

### @tobiu - 2025-11-18T08:55:06Z

@MannXo Now that we do have playwright in place, we could most likely define a pre-commit and pre-pull-request hook inside `.github/workflows` to automate it. Let's see, I am distracted with the SSR topic.


