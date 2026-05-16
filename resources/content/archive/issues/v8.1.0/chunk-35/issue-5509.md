---
id: 5509
title: 'Portal.view.home.parts.Helix: test rendering the helix into an iframe'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-01T11:57:29Z'
updatedAt: '2024-07-01T14:14:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5509'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-01T14:14:28Z'
---
# Portal.view.home.parts.Helix: test rendering the helix into an iframe

```
            items : [{
                module   : LivePreview,
                cls      : ['page-live-preview'],
                height   : '100%',
                reference: 'live-preview',

                value: [
                    "import IFrame   from '../component/IFrame.mjs';",
                    "import Viewport from '../container/Viewport.mjs';",
                    "",
                    "class MainView extends Viewport {",
                    "    static config = {",
                    "        className: 'Portal.view.MultiWindowHelix',",
                    "        layout   : 'fit',",
                    "",
                    "        items: [{",
                    "            module: IFrame,",
                    "            src   : '../../examples/component/multiWindowHelix/'",
                    "        }]",
                    "    }",
                    "}",
                    "",
                    "Neo.setupClass(MainView);"
                ].join('\n')
            }]
```

## Timeline

- 2024-07-01T11:57:29Z @tobiu added the `enhancement` label
- 2024-07-01T11:57:29Z @tobiu assigned to @tobiu
### @tobiu - 2024-07-01T11:58:26Z

tried it out, but am facing the same issues as before. in chrome only, the helix manages to even break out of the iframe boundaries:

![Screenshot 2024-07-01 at 13 56 16](https://github.com/neomjs/neo/assets/1177434/c7c28636-1790-4515-82f5-f0db5cbd8231)


### @tobiu - 2024-07-01T14:14:28Z

fixed by: https://github.com/neomjs/neo/issues/5510

- 2024-07-01T14:14:28Z @tobiu closed this issue

