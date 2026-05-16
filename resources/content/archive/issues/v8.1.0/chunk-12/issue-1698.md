---
id: 1698
title: buildScripts/webpack/json/build.json => examples structure
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-31T19:35:27Z'
updatedAt: '2021-03-31T22:53:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1698'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-31T22:41:05Z'
---
# buildScripts/webpack/json/build.json => examples structure

the list-structure was sufficient when the project only had a few examples, but this is no longer the case.

it would be nice if we could use a nested examples structure, which matches the real folder & file structure.

to do this, we need to adjust `webpack.config.appworker.js` as well for the development and production mode.

it makes sense to move the `HtmlWebpackPlugin` generation into an own method.

## Timeline

- 2021-03-31T19:35:27Z @tobiu added the `enhancement` label
- 2021-03-31T19:35:27Z @tobiu assigned to @tobiu
- 2021-03-31T22:34:08Z @tobiu referenced in commit `66ec450` - "buildScripts/webpack/json/build.json => examples structure #1698"
### @tobiu - 2021-03-31T22:41:05Z

not an easy one :)

- 2021-03-31T22:41:05Z @tobiu closed this issue
### @tobiu - 2021-03-31T22:53:08Z

<img width="495" alt="Screenshot 2021-04-01 at 00 50 37" src="https://user-images.githubusercontent.com/1177434/113221023-8a62c800-9284-11eb-87f2-a0c9d0e697a3.png">

deployment to github pages:
none of the example output files changed.

a perfect unit test.


