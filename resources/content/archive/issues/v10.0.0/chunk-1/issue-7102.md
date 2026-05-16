---
id: 7102
title: Examples website is flaky on Safari (sometimes in Chrome too)
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-07-24T03:46:29Z'
updatedAt: '2025-07-24T05:46:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7102'
author: Nek
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-24T05:40:37Z'
---
# Examples website is flaky on Safari (sometimes in Chrome too)

**Describe the bug**
It takes some time for Safari desktop browser on my M1 Pro to become responsive. First, it's just whitescreen, then components start to load their data (or so it seems). Everything is super slow. Then all of a sudden everything is white again.

**To Reproduce**
Steps to reproduce the behavior:
Go to https://neomjs.com/dist/production/apps/portal/#/examples using MacOS Safari.

**Expected behavior**
Fast, smooth and consistent page render.

**Screenshots**
If applicable, add screenshots to help explain your problem.
<img width="2507" height="282" alt="Image" src="https://github.com/user-attachments/assets/f87a4ffd-8984-4624-ae13-d09c5c636077" />

<img width="2821" height="1357" alt="Image" src="https://github.com/user-attachments/assets/1acdbb33-f41e-42ab-adc9-5130f0539637" />

**Desktop (please complete the following information):**
 - OS: macOS Sequoia Version 15.5
 - Browser: Version 18.5 (20621.2.5.11.8)

**Additional context**
It's not an issue for desktop environments where underlying platform can be picked in advance, but for the web it could become an issue. The time for the webpage to become interactive should be close to percievable zero. This is of course doable with bare basics: html, css, js, but hard to achieve with any kind of framework.

## Timeline

- 2025-07-24T03:46:30Z @Nek added the `bug` label
- 2025-07-24T03:46:52Z @Nek changed title from **Examples website is flaky in Safari (sometimes in Chrome too)** to **Examples website is flaky on Safari (sometimes in Chrome too)**
### @tobiu - 2025-07-24T04:40:32Z

Hi @Nek, thanks for the report, very much appreciated!

https://github.com/user-attachments/assets/030854f6-9eb6-4065-bb29-129da385fd48

This is what I get with Safari 18.5. My Mac is still Intel based (3,2 GHz 8-Core Intel Xeon W), so there can be differences.

The delay is easy to explain:

All images start without a `src` attribute. The list view does add an `IntersectionObserver`, and once this fires its first intersect event, visible list items get their src attribute. An optimisation technique, mostly intended to update more items when scrolling.

As an easy fix, we could just give the first e.g. 3 items the src attribute right away.

- 2025-07-24T04:57:58Z @tobiu referenced in commit `6fea520` - "Examples website is flaky on Safari #7102"
### @tobiu - 2025-07-24T05:01:55Z

https://github.com/user-attachments/assets/9857b7d6-8df6-485f-b086-1bae80590eeb

This is the dev mode locally (no service worker caching), but the white background showing first is gone. We could enhance it more (e.g. `afterSetMounted()` => grabbing the DOMRect, using a more accurate item number, in case the `store` has not loaded yet.

I will push the hotfix attempt online in a couple of hours tops. Big day today => v10 stable.

### @Nek - 2025-07-24T05:40:37Z

Thanks a lot! You put an admirable amount of love into this project and the ideas behind it are extraordinary. It's like a breath of fresh air. I have to dedicate the weekend to learning your project I think. 🤩

- 2025-07-24T05:40:37Z @Nek closed this issue
### @tobiu - 2025-07-24T05:46:14Z

@Nek thx! the biggest spoiler i have:
https://github.com/neomjs/neo/blob/dev/learn/blog/v10-post1-love-story.md

=> the v10 blog post series is already inside the repo. i will publish the first 2 on medium, once v10 is released & deployed to the website. pushing my luck: just updated fontawesome to v7^^


