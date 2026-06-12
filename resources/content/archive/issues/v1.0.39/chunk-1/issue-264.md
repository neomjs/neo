---
id: 264
title: Remove buildScripts/webpack/entrypoints/App.mjs
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-03-12T11:27:20Z'
updatedAt: '2020-03-12T11:39:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/264'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-12T11:39:34Z'
---
# Remove buildScripts/webpack/entrypoints/App.mjs

The only reason this override-file exists was Firefox parsing dynamic imports at build-time instead of run time.

```
            if (!Neo.config.isExperimental) {
                Neo.onStart();

                if (Neo.config.hash) {
                    HashHistory.push(Neo.config.hash, Neo.config.hashString);
                }
            } else {
                // todo: in case FF still does not support dynamic imports, remove the dynamic import call for FF dev builds

                import(
                    /* webpackIgnore: true */
                    '../../' + me.data.path).then((module) => {
                        Neo.onStart();

                        if (Neo.config.hash) {
                            HashHistory.push(Neo.config.hash, Neo.config.hashString);
                        }
                    }
                );
            }
```

=> this import() broke the dist versions, although the code was not reachable.

Luckily, this is no longer the case, so we can remove the file now and adjust the entrypoints.

## Timeline

- 2020-03-12T11:27:20Z @tobiu added the `enhancement` label
- 2020-03-12T11:27:21Z @tobiu assigned to @tobiu
- 2020-03-12T11:32:51Z @tobiu referenced in commit `1ebf6b9` - "Remove buildScripts/webpack/entrypoints/App.mjs #264"
- 2020-03-12T11:37:17Z @tobiu referenced in commit `a88edb0` - "Remove buildScripts/webpack/entrypoints/App.mjs #264: adjusted the createApp script to point to the default app worker"
### @tobiu - 2020-03-12T11:39:33Z

done.

- 2020-03-12T11:39:34Z @tobiu closed this issue

