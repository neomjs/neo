---
id: 5899
title: Examples sometimes fail to load
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-09-13T14:49:45Z'
updatedAt: '2024-09-15T14:53:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5899'
author: jzombie
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T14:53:39Z'
---
# Examples sometimes fail to load

**Describe the bug**
A clear and concise description of what the bug is.

Getting a "white screen" when first navigating to https://neomjs.com/dist/production/apps/portal/#/examples.

My apologies, I didn't capture any debug logs or a screenshot.

Happened in Chrome on Mac, from Nicaragua. 

**To Reproduce**

This is tricky because I can't reproduce it, even in Incognito or in Firefox, but it's happened in the past as well on Chrome.

**Expected behavior**

To be able to view content.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Desktop (please complete the following information):**
 - OS:  macOS 13.6.7
 - Browser:  Chrome 
 - Version: 128.0.6613.120 

**Additional context**
My apologies I didn't capture a screenshot.  I originally did and was going to post it on LinkedIn, but decided that a bug report was more appropriate.  In the process, I deleted the screenshot that I took, and now can't seem to reproduce it.



## Timeline

- 2024-09-13T14:49:45Z @jzombie added the `bug` label
### @tobiu - 2024-09-13T15:03:29Z

Hi Jeremy ( @jzombie ),

thanks for the input! I think this is related to the service worker (caching). In case I do deploy a new version, the SW gets notified and clears the entire cash. However, at this point it probably already is too late and some old files have been loaded. Especially problematic in dist/production => Webpack bundles.

A reload will already fix it, but I do agree that this is not a nice UX. What we can / should do: In case the SW gets the new version notification, it should tell the connected app about it => opening an alert / dialog, telling the user that a new version is available and a reload is required.

Thoughts?

Best regards,
Tobi

### @jzombie - 2024-09-13T15:53:27Z

My thoughts are that if the page isn't loading at all, it should do a force reload, if that's possible.  There was no content on the page at all.


### @tobiu - 2024-09-14T10:40:06Z

From a technical perspective, it has to be this spot:
https://github.com/neomjs/neo/blob/dev/src/worker/ServiceBase.mjs#L252

If the version did change, we need to send back a `versionChange` message. This could either be a direct message or a broadcast to all connected clients. When receiving it, we can trigger a notification or reload.

- 2024-09-15T14:51:00Z @tobiu referenced in commit `8a0f3eb` - "#5899 trigger a location.reload() in case a connected service worker receives a new version."
### @tobiu - 2024-09-15T14:53:40Z

Hi Jeremy,

the "force reload when a SW gets a new version" is in place now. crossed fingers :)

While creating the changes, I managed to create an infinite reload loop (classic). So I learned how to kill a SW instance from a non-connected window.

Feel free to take a look into the commit.

Best regards,
Tobi

- 2024-09-15T14:53:40Z @tobiu closed this issue

