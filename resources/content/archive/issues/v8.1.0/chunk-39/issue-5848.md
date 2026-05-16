---
id: 5848
title: 'theme-neo-light: splitter styling'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-09-01T11:53:46Z'
updatedAt: '2024-09-01T12:31:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5848'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-01T12:31:06Z'
---
# theme-neo-light: splitter styling

some custom overrides got into the splitter styling which are problematic:
```
    .neo-splitter {
        opacity: 1;
        margin: 8px 2px;
        border-radius: 100px;
        border: unset !important;

        &:hover, &:active {
            background-color: #5595F5 !important;
        }
    }

    .neo-dragproxy {
        &.neo-splitter {
            background-color: #5595F5 !important;
        }
    }
```

![Screenshot 2024-09-01 at 13 46 31](https://github.com/user-attachments/assets/4a2aa79d-6e89-453c-899f-c4e2ac27c770)

while the design might be ok for vertical splitters, the margin will look odd for horizontal ones.

another problem is that the dragProxy logic does not honor it yet:
![Screenshot 2024-09-01 at 13 47 29](https://github.com/user-attachments/assets/ddd1fc85-301c-42d7-ae79-1921bfc008a7)

so dragging moves the content too far to the bottom.

i will move the possible changes into the theme vars and remove the margin for now.

@mxmrtns: please create a new ticket in case you would like to see a proper implementation for border-radius & margins.

## Timeline

- 2024-09-01T11:53:46Z @tobiu added the `bug` label
- 2024-09-01T11:53:47Z @tobiu assigned to @tobiu
- 2024-09-01T12:28:35Z @tobiu referenced in commit `089d8a4` - "theme-neo-light: splitter styling #5848"
### @tobiu - 2024-09-01T12:31:06Z

i changed my mind and did the follow-up part right away.

3 new theming vars for all themes:
```
    --splitter-border-radius    : 5px;
    --splitter-margin-horizontal: 2px 8px;
    --splitter-margin-vertical  : 8px 2px;
```

the positioning bug was easy to fix:
getBoundingClientRect() already adds margins to positions, so it would get added twice unless we nullify it for the proxy.

look into the last commit for details.

![Screenshot 2024-09-01 at 14 26 56](https://github.com/user-attachments/assets/79b3762c-8ab3-4634-80ba-dfb52a0134a0)

![Screenshot 2024-09-01 at 14 27 14](https://github.com/user-attachments/assets/c073a5f9-beb1-4870-bb1b-46fe13fc72e0)

- 2024-09-01T12:31:06Z @tobiu closed this issue

