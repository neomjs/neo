---
id: 1970
title: Manually adjust the source maps for the new theming engine
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-06T10:33:07Z'
updatedAt: '2021-05-06T13:49:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1970'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-06T13:49:02Z'
---
# Manually adjust the source maps for the new theming engine

Since we are using `sass.render()` not starting from a file, but the data property (file buffer), we do not get the desired output yet.

I already changed the buffer so that everything we are adding up front is in 1 line => the line numbers are correct.

However, we do not see the file name inside the dev tools:
![Screenshot 2021-05-06 at 12 19 56](https://user-images.githubusercontent.com/1177434/117284354-05606500-ae67-11eb-99b8-0f8cf0958c2d.png)

It is a little bit tricky, although we do get the file info as well:
<img width="774" alt="Screenshot 2021-05-06 at 12 28 47" src="https://user-images.githubusercontent.com/1177434/117284430-190bcb80-ae67-11eb-8828-a526d03c7c3d.png">

<img width="1023" alt="Screenshot 2021-05-06 at 12 26 09" src="https://user-images.githubusercontent.com/1177434/117284453-1f9a4300-ae67-11eb-8427-59f587b38494.png">

stdin can either be at the first or second index and there are mappings based on the index.

looking into this now.

## Timeline

- 2021-05-06T10:33:07Z @tobiu added the `enhancement` label
- 2021-05-06T10:33:07Z @tobiu assigned to @tobiu
- 2021-05-06T12:11:54Z @tobiu referenced in commit `d80d353` - "Manually adjust the source maps for the new theming engine #1970"
- 2021-05-06T12:12:02Z @tobiu closed this issue
- 2021-05-06T12:12:37Z @tobiu reopened this issue
### @tobiu - 2021-05-06T12:12:47Z

ha, almost. the top level styles are correct, the inherited styles however have wrong line numbers.

- 2021-05-06T13:41:57Z @tobiu referenced in commit `9cc5165` - "#1970 reducing the scssCombine() output to 1 line"
- 2021-05-06T13:45:56Z @tobiu referenced in commit `f2587a1` - "#1970 using target instead of src"
### @tobiu - 2021-05-06T13:49:02Z

bloody hell. done!

- 2021-05-06T13:49:02Z @tobiu closed this issue

