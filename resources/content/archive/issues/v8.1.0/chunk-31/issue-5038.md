---
id: 5038
title: 'worker.App: createNeoInstance() => add autoMount & autoRender, in case no parentId is send'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-10-18T14:54:39Z'
updatedAt: '2023-10-18T15:10:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5038'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-18T15:10:32Z'
---
# worker.App: createNeoInstance() => add autoMount & autoRender, in case no parentId is send

default: `parentId: 'document.body'` => not dropping the vdom into a container => we most likely want to mount the cmp (e.g. testing context).

## Timeline

- 2023-10-18T14:54:39Z @tobiu added the `enhancement` label
- 2023-10-18T14:54:39Z @tobiu assigned to @tobiu
- 2023-10-18T15:10:24Z @tobiu referenced in commit `e042135` - "worker.App: createNeoInstance() => add autoMount & autoRender, in case no parentId is sent #5038"
- 2023-10-18T15:10:32Z @tobiu closed this issue
- 2023-10-18T16:09:18Z @tobiu referenced in commit `98f0b2e` - "v6.9.1 (#5040)

* dependencies update

* component.Base: add a data / dataset property for vdom nodes #5028

* build(deps-dev): bump @babel/traverse from 7.18.5 to 7.23.2 (#5026)

Bumps [@babel/traverse](https://github.com/babel/babel/tree/HEAD/packages/babel-traverse) from 7.18.5 to 7.23.2.
- [Release notes](https://github.com/babel/babel/releases)
- [Changelog](https://github.com/babel/babel/blob/main/CHANGELOG.md)
- [Commits](https://github.com/babel/babel/commits/v7.23.2/packages/babel-traverse)

---
updated-dependencies:
- dependency-name: "@babel/traverse"
  dependency-type: indirect
...

Signed-off-by: dependabot[bot] <support@github.com>
Co-authored-by: dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>

* Create a new Siesta harness for component-based testing #5030

* #5030 PoC to render a first neo button into the testing harness

* #5030 app.mjs => imports comment

* #5030 app.mjs => imports comment

* #5030 added a DateSelector rendering test

* form.field.Select: filterOperator & useFilter should be configs #5032

* collection.Filter: add a startsWith operator for strings #5033

* collection.Filter: add a endsWith operator for strings #5035

* Bring Toast into line. Implement a data-neo-tooltip="Show Text" attribute

* Fix hidden trigger in Selectfield

* worker.App: createNeoInstance() => add autoMount & autoRender, in case no parentId is sent #5038

* #5030 added form.field.Select as a more complex use case

* form.field.Text: updateReadOnlyState() #5039

* form.field.Text: minor cleanup

* v6.9.1"

