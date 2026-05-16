---
id: 5675
title: 'component.Video: errorMsg config'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2024-08-03T18:32:58Z'
updatedAt: '2024-08-10T16:32:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5675'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-10T16:32:21Z'
---
# component.Video: errorMsg config

Defined as a boolean instead of a string.

```
    afterSetUrl(value, oldValue) {
        if (!value) return;

        let {vdom} = this,
            media = VDomUtil.getFlags(vdom, 'media')[0];

        media.cn = [{
            tag: 'source',
            src: value,
            type: this.type
        }, {
            tag: 'span',
            html: this.errorMsg,
        }];

        this.update()
    }
```

Why would you always drop in an error message for all browsers?

Except for Opera Mini, all browsers can handle it:
https://caniuse.com/video

So we should not add not needed DOM nodes for others.

## Timeline

- 2024-08-03T18:32:58Z @tobiu added the `bug` label
- 2024-08-03T18:32:58Z @tobiu assigned to @Dinkh
### @Dinkh - 2024-08-10T16:32:21Z

updated

- 2024-08-10T16:32:21Z @Dinkh closed this issue

