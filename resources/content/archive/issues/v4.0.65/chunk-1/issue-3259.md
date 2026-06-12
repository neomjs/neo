---
id: 3259
title: 'buildScripts/createClass: import paths inside the workspace scope'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-04T07:27:19Z'
updatedAt: '2022-07-04T10:31:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3259'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-04T07:47:33Z'
---
# buildScripts/createClass: import paths inside the workspace scope

framework related base class imports are missing the `node_modules/neo.mjs/src` part.

will take a look into this.

## Timeline

- 2022-07-04T07:27:19Z @tobiu added the `enhancement` label
- 2022-07-04T07:27:19Z @tobiu assigned to @tobiu
### @tobiu - 2022-07-04T07:38:11Z

```
const
      __dirname   = fileURLToPath(new URL('../', import.meta.url)),
      cwd         = process.cwd(),
      requireJson = path => JSON.parse(fs.readFileSync((path))),
      packageJson = requireJson(path.join(__dirname, 'package.json')),
      insideNeo   = packageJson.name === 'neo.mjs',
```

we had `__dirname = path.resolve()` before and this explains, why `insideNeo` now always stays true which collides with the import paths.

@ThorstenSuckow I guess the change is required for the drop logic, but we need a way to "unbreak" the default mode. i will create a workaround, but it would be appreciated if you could double-check it as well.

- 2022-07-04T07:46:19Z @tobiu referenced in commit `1707ffc` - "buildScripts/createClass: import paths inside the workspace scope #3259"
### @tobiu - 2022-07-04T07:47:33Z

I kept the packageJson variable as it is, but adjusted the framework check:
`insideNeo = process.env.npm_package_name === 'neo.mjs',`

this should not affect the drop mode.

- 2022-07-04T07:47:34Z @tobiu closed this issue
### @ThorstenSuckow - 2022-07-04T10:29:47Z

We should probably add more test cases for this in the future. Is the `insideNeo` an indicator for the location from which the script was executed?


### @tobiu - 2022-07-04T10:31:01Z

correct. as long as you don't use the name `neo.mjs` as the package name of your workspace, it is a safe bet.


