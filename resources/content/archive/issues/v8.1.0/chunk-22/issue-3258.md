---
id: 3258
title: 'buildScripts/createClass: workspace scope'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-07-03T22:43:25Z'
updatedAt: '2022-07-04T07:19:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3258'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-04T07:19:41Z'
---
# buildScripts/createClass: workspace scope

without the `isDrop` option, workspace related apps no longer get found.

might be related to @ThorstenSuckow's changes that `__dirname` is no longer pointing to `process.cwd()`.

will investigate this further tomorrow.

## Timeline

- 2022-07-03T22:43:25Z @tobiu added the `bug` label
- 2022-07-03T22:43:25Z @tobiu assigned to @tobiu
- 2022-07-04T06:58:34Z @tobiu referenced in commit `b162733` - "buildScripts/createClass: workspace scope #3258"
### @tobiu - 2022-07-04T07:00:42Z

```
            if (isDrop !== true) {
                if (fs.existsSync(path.resolve(cwd, 'apps', rootLowerCase))) {
                    classFolder = path.resolve(cwd, 'apps', rootLowerCase, ns.join('/'));
                } else {
                    console.log('\nNon existing neo app name:', chalk.red(root));
                    process.exit(1);
                }
            }
```

changed the 2 __dirname replacements back to cwd. it should not affect the drop mode.

### @tobiu - 2022-07-04T07:19:41Z

@ThorstenSuckow to shed some light into this: inside the neo.mjs package.json, we included the program like this:
`"create-class": "node ./buildScripts/createClass.mjs",`

inside the workspace based scope, the package.json contains:
`"create-class": "node ./node_modules/neo.mjs/buildScripts/createClass.mjs",`

so, we do want to parse the "top level" => workspace based apps here and not the ones inside the neo repo.

while we could just copy the buildScripts into each workspace, the beauty is that we don't have to: pretty much all of them are intended to work in both scopes (easier to maintain, in case the logic changes).

i did not test the drop mode inside the workspace based scope yet, but this would be a new ticket.

- 2022-07-04T07:19:41Z @tobiu closed this issue

