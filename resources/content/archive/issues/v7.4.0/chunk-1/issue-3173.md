---
id: 3173
title: 'app worker build, workspace scope, windows'
state: CLOSED
labels:
  - bug
  - windows
  - stale
assignees:
  - tobiu
createdAt: '2022-06-21T10:59:36Z'
updatedAt: '2024-09-15T02:35:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3173'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:45Z'
---
# app worker build, workspace scope, windows

Right now, the windows builds are running fine inside the framework scope, but they fail silently when running inside a neo workspace (`npx neo-app`).

The problem seems to be the combination of our app worker entry-point:
```
    importApp(path) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4);
        }

        return import(
            /* webpackInclude: /[\\\/]app.mjs$/ */
            /* webpackExclude: /[\\\/]node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        );
    }
```

https://github.com/neomjs/neo/blob/dev/src/worker/App.mjs#L98

in combination with the ContextReplacementPlugin (webpack):
https://webpack.js.org/plugins/context-replacement-plugin/

The relevant code is this one:
```
        plugins: [
            new webpack.ContextReplacementPlugin(/.*/, context => {
                if (!insideNeo && context.context.includes('/src/worker')) {
                    context.request = '../../' + context.request;
                }
            }),
            ...plugins
        ]
```
https://github.com/neomjs/neo/blob/dev/buildScripts/webpack/production/webpack.config.appworker.mjs#L135

Obviously we need to check for `\\src\\worker` and adjust context.request using the `path` nodejs API.

However, when adding testing logs, I saw that our one app worker based dynamic import to fetch potential app entry-points will get called twice inside the ContextReplacementPlugin. Even the same instance. so, instead of going up for another 2 folder levels, it will end up going up for 4 levels instead.

This might be a topic for @sokra.

As a workaround, we could adjust the code in a way, that `context.request` will only get modified once.

@Dinkh, @davhm: I could use your help on this one, since I no longer have Windows running inside a VM on my machine(s).

## Timeline

- 2022-06-21T10:59:36Z @tobiu added the `bug` label
- 2022-06-21T10:59:36Z @tobiu assigned to @tobiu
- 2022-06-21T13:27:40Z @tobiu referenced in commit `31c8efa` - "app worker build, workspace scope, windows #3173"
### @tobiu - 2022-06-21T13:31:06Z

hotfix candidate: https://github.com/neomjs/neo/releases/tag/4.0.49

- 2022-07-04T20:13:05Z @tobiu added the `windows` label
### @github-actions - 2024-08-31T02:25:46Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:46Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:45Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:45Z @github-actions closed this issue

