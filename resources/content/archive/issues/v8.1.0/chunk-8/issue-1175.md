---
id: 1175
title: 'Project will not build on windows machines, nothing in dist folder'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-09-10T08:06:13Z'
updatedAt: '2020-09-10T09:00:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1175'
author: notnikola1
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-10T08:25:28Z'
---
# Project will not build on windows machines, nothing in dist folder

**Describe the bug**
There is no working build on windows machines.

**To Reproduce**
Steps to reproduce the behavior:
1. Checkout the project
2. do npm run install
3. do npm run build-all
4. do npm run server-start

**Expected behavior**
The project builds correctly with all the code and CSS

**Desktop (please complete the following information):**
 - OS: Windows 10
 - Browser: Chrome
 - Version: 85 (latest/any)


**Additional context**
Windows has specific path resolving issues that are not addressed


## Timeline

- 2020-09-10T08:06:13Z @notnikola1 added the `bug` label
- 2020-09-10T08:19:40Z @notnikola1 cross-referenced by PR #1176
- 2020-09-10T08:25:28Z @tobiu closed this issue
### @tobiu - 2020-09-10T08:32:52Z

Hi Nick and welcome to the community!

Thx for the PR, I have not tested builds on windows in ages. It did work before adding the build programs, but this was quite a while back.

I think we don't need the new webpackResolvedPath variable.

```
if (process.platform === "win32") {
        // due to specific windows pathing we must do a lil bit of hackery to get it to build properly
        // functionality on linux/mac remains unchanged
        webpack = path.resolve(webpack).replace(/\\/g,'/');
    }
```

should do the same. I might do this minor cleanup, does not really matter though inside the build tools.

### @tobiu - 2020-09-10T08:42:43Z

Just out of curiosity: What would happen in case you are using Windows, but with a Linux Kernel? This might require slashes instead of backslashes again.

Well, I am definitely not a Windows guy, so no clue.

### @notnikola1 - 2020-09-10T08:46:17Z

 yeah, you're right, its just a habit from years of working in my current
company to declare a new variable always rather than using the old one.

///

as for the linux kernel, are you referring to the linux subsystem that is
on windows 10?

honestly, i wouldn't know, i never used it, i actually dual boot between
linux and windows when i need to : /

On Thu, Sep 10, 2020 at 10:43 AM Tobias Uhlig <notifications@github.com>
wrote:

> Just out of curiosity: What would happen in case you are using Windows,
> but with a Linux Kernel? This might require slashes instead of backslashes
> again.
>
> Well, I am definitely not a Windows guy, so no clue.
>
> —
> You are receiving this because you authored the thread.
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/1175#issuecomment-690086887>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/AH3DUWWCUNTZITUOWKXPYODSFCGRHANCNFSM4REQEALQ>
> .
>


### @tobiu - 2020-09-10T09:00:18Z

Meant this one: https://linuxhint.com/linux_kernel_windows10/

Well, let's assume using it changes process.platform in node. If not, there will be a new ticket for sure.

Feel free to jump into the Slack Channel in case you have any questions on neo in general. The vdom concept can be a bit confusing at first.

Best regards, Tobias

- 2020-09-10T10:45:54Z @tobiu referenced in commit `794d2a3` - "#1175 cleanup to apply the fix to win64 users as well & keep the code style in sync for the create-app repo"

