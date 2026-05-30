---
id: 3311
title: Stabilize and improve versioning for the package neo.mjs by introducing beta version directly from dev branch
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-07-20T09:36:58Z'
updatedAt: '2024-09-14T02:26:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3311'
author: davhm
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:58Z'
---
# Stabilize and improve versioning for the package neo.mjs by introducing beta version directly from dev branch

Currently every small improvement on _dev_ is merged into _main_ to be published and installable by users of neo.

### Disadvantages for developers:
- It breaks semantic versioning:
  - New features are being added without raising the minor version number
  - New patch versions are published which might introduce breaking changes, which breaks stable projects using the package after an `npm install` 
- It introduces the risk of publishing unstable and untested changes as a main version. A user relying on neo for productive work installs a new version of the package (e.g. 4.0.98) to find out it is broken. They then have to find the version causing the breakage & manually downgrade the package while they wait for a fix.
In summary: A very painful developer experience if you want a stable app using neo

### Disadvantages for contributors:
- Every small improvement has to be merged into main immediately to be testable elsewhere.
- No way to easily consume and test experimental changes locally without breaking the stable version of the package

## Proposed change
Instead, I propose to publish a **beta version directly from dev branch,** which adds for example the latest commit id into a published version, like `4.1.0-beta.3dc41d8a2'.

Then, using [`npm dist-tags`](https://docs.npmjs.com/cli/v8/commands/npm-dist-tag). a version tag can be added (for example) as:
- `neo.mjs@beta` or 
- `neo.mjs@<next-minor-version>-beta`

The dist-tag points to the latest published version, so that users can then explicitly `npm install neo.mjs@

Advantages:
- Semantic versioning is respected, so that stable projects consuming neo won't get unstable versions on every `npm install`
- Users who want to test/require the in-development features of neo which might not yet be stable can specifically explicitly `npm install neo.mjs@rc` and still get the latest changes to the package, without 


## Timeline

- 2022-07-20T09:36:58Z @davhm added the `enhancement` label
### @tobiu - 2022-07-20T09:40:25Z

David, this part:
"New features are being added without raising the minor version number"

is actually **not** correct.

a merge from dev to main **only** happens in case there is a new minor version number, which will then get released into a new npm package version.

### @davhm - 2022-07-20T12:15:31Z

This means the new patch versions are being released from the dev branch already, without any merging into main?

For example, setting default headers for XHR requests was added. This however didn't result in a minor version increase, but just a patch version.

### @Dinkh - 2022-07-20T14:59:47Z

I would go with beta versions too.
That way we can write version upgrade plans, so that users do not loose stability.
Instead of having 20 minor versions, we this might be the next version incrementation:

next            4.0.71.123
next beta    4.0.72
next public 4.1.0

### @github-actions - 2024-08-30T02:27:53Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:53Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:57Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:58Z @github-actions closed this issue

