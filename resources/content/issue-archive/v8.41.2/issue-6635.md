---
id: 6635
title: 'core.Observable: not removing listeners with "once" properly, for multiple occurences on the same event target'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-04-08T22:37:29Z'
updatedAt: '2025-04-08T22:38:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6635'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-08T22:38:01Z'
---
# core.Observable: not removing listeners with "once" properly, for multiple occurences on the same event target

* We are iterating over a shallow copy of the `listeners[name]` array
* splice() using the current index works for the first match, but for following iterations, the index is too high

component.Base:
```
     async render(mount) {
        let me              = this,
            autoMount       = mount || me.autoMount,
            {app}           = me,
            {useVdomWorker} = Neo.config;

        // Verify that the critical rendering path => CSS files for the new tree is in place
        if (autoMount && currentWorker.countLoadingThemeFiles !== 0) {
            currentWorker.on('themeFilesLoaded', function() {
                !me.mounted && me.render(mount)
            }, me, {once: true});

            return
        }
```

Especially for form field trigger clicks, which show a picker, it can lead to side effects.

## Timeline

- 2025-04-08T22:37:29Z @tobiu added the `bug` label
- 2025-04-08T22:37:54Z @tobiu referenced in commit `5980dfe` - "core.Observable: not removing listeners with "once" properly, for multiple occurrences on the same event target #6635"
- 2025-04-08T22:38:01Z @tobiu closed this issue

