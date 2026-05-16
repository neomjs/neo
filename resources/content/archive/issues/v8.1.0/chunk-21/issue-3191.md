---
id: 3191
title: 'NEO.MJS RFC: Introduce mandatory format for commit messages'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-06-24T10:12:06Z'
updatedAt: '2024-09-13T02:30:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3191'
author: ThorstenSuckow
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:24Z'
---
# NEO.MJS RFC: Introduce mandatory format for commit messages

# NEO.MJS RFC:  Project specific commit format
- Version: 1.0
 - Date: 24.06.2022
 - Author: Thorsten Suckow-Homberg <thorsten@suckow-homberg.de>
 - Status: Draft
 - Versions affected: V4.0.51
 
## Introduction
This RFC proposes to introduce a commit message format into the project. A global format for commit messages helps in understanding commit history and describing changes more explicitly.

The current situation allows for any type of text without further checking on the format and syntactical validity of the message itself.

## Proposal
The  [Conventional Commits specification](https://conventionalcommits.org) is a widely known and accepted specification for structuring commit messages, effectively allowing to tag commits with a type, a scope and the commit's intend:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

It dovetails with [SemVer](http://semver.org/) which the project already uses for identifying release versions of the software.

It also provides the benefits in helping with automatically generating CHANGELOGs


## Changes that affect the current specification
None, since currently no specifications exist. However, on top of the current set of the tools used, a pre-commit hook would be recommended to check for the validity of the commit message:

https://github.com/conventional-changelog/commitlint

This can be easily integrated into the project using **npm** packages.











## Timeline

- 2022-06-24T10:12:06Z @ThorstenSuckow added the `enhancement` label
### @ThorstenSuckow - 2022-06-24T10:12:52Z

Feel free to create a ticket out of the issue and assign it back to me for a PR.

### @davhm - 2022-06-24T12:13:45Z

Big strong fat +1  -- I've annoyed @tobiu with this before because I fully agree with the value it provides

- 2022-06-24T12:20:16Z @ThorstenSuckow changed title from **NEO.MJS RFC: Introduce manadatory format for commit messages** to **NEO.MJS RFC: Introduce mandatory format for commit messages**
### @tobiu - 2022-06-25T09:39:07Z

well, i am open to the change. might slow me down a little bit while getting adjusted at first^^

in case we create a required format, i would also make a reference to a related ticket mandatory.

### @ThorstenSuckow - 2022-06-25T15:52:31Z

I'd probably leave the "refs" out of the mandatory requirements for a commit message, since changes tagged with "style" or general housekeeping  would clutter the issuetracker with too many unnecessary tickets which would have to be opened _before_ a commit can be executed, e.g. for a code format change I'd think this would rather be a tedious task.

### @github-actions - 2024-08-30T02:28:10Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:28:11Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:23Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:24Z @github-actions closed this issue

