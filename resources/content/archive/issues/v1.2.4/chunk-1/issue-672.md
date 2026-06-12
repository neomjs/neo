---
id: 672
title: 'createApp program: honoring the program options'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-05T11:00:36Z'
updatedAt: '2020-06-05T11:05:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/672'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-05T11:05:42Z'
---
# createApp program: honoring the program options

some parts here still need a cleanup:

```
        if (answers['mainThreadAddons'] !== 'Stylesheet') {
            indexContent[indexContent.length -1] += ',';
            indexContent.push("            mainThreadAddons: [" + mainThreadAddons.map(e => "'" + e +"'").join(', ') + "]");
        }

        if (answers['themes'] !== 'both') {
            indexContent[indexContent.length -1] += ',';
            indexContent.push("            themes          : [" + themes.map(e => "'" + e +"'").join(', ') + "]");
        }
```

=> this does not check the program options itself, just the inquirer answers.

## Timeline

- 2020-06-05T11:00:37Z @tobiu added the `enhancement` label
- 2020-06-05T11:00:37Z @tobiu assigned to @tobiu
- 2020-06-05T11:05:39Z @tobiu referenced in commit `949790a` - "createApp program: honoring the program options #672"
- 2020-06-05T11:05:42Z @tobiu closed this issue

