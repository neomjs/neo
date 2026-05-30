---
id: 5724
title: 'Portal.view.home.parts.Helix: use the new Portal.view.home.FeatureSection base class'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-08T09:30:24Z'
updatedAt: '2024-08-08T09:38:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5724'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-08T09:38:01Z'
---
# Portal.view.home.parts.Helix: use the new Portal.view.home.FeatureSection base class

@mxmrtns @maxrahder 

keeping a reference for the full content here:

```
        items: [{
            ntype : 'container',
            cls   : ['portal-content-text'],
            flex  : '1',
            style : {padding: '2rem'},
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                cls : 'neo-h1',
                flex: 'none',
                html: 'Extreme Speed',
                tag : 'h1'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: '40,000 Updates /s',
                tag : 'h2'
            }, {
                cls : 'neo-h3',
                flex: 'none',
                tag : 'p',

                html: [
                    'This demo shows the Neo.mjs helix component, along with a "Helix Controls" panel. ',
                    'Move your cursor over the helix, then rapidly scroll left and right to rotate, and up and down to zoom. ',
                    'As you do, look at the delta updates counter at the top. ',
                    'Neo.mjs easily handles 40,000 updates per second, and beyond.'
                ].join('')
            }, {
                cls : 'neo-h1',
                flex: 'none',
                html: 'Multi-Window',
                tag : 'h1'
            }, {
                cls : 'neo-h2',
                flex: 'none',
                html: 'Seamless and Simple',
                tag : 'h2'
            }, {
                cls : 'neo-h3',
                flex: 'none',
                tag : 'p',

                html: [
                    'Click on the small window icon in the Helix Controls title bar and the controls open in their own window ',
                    'which can be moved to a separate monitor. But the application logic doesn\'t care &mdash; ',
                    'the logic updates the controls just like before, and framework seamlessly handles updating the DOM across windows.'
                ].join('')
            }]
```

## Timeline

- 2024-08-08T09:30:25Z @tobiu added the `enhancement` label
- 2024-08-08T09:30:25Z @tobiu assigned to @tobiu
- 2024-08-08T09:37:56Z @tobiu referenced in commit `5486eef` - "Portal.view.home.parts.Helix: use the new Portal.view.home.FeatureSection base class #5724"
- 2024-08-08T09:38:01Z @tobiu closed this issue

