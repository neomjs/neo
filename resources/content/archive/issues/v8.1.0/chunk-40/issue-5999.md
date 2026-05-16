---
id: 5999
title: 'Portal App: Home => Features Section Changes cleanup'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-10-01T21:22:54Z'
updatedAt: '2024-10-02T12:08:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5999'
author: tobiu
commentsCount: 7
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-02T12:08:38Z'
---
# Portal App: Home => Features Section Changes cleanup

@VedantDewangan: Tagging you here, so that you can follow what I will change.

Let's start with the alphabet rule order and using 4 spaces.

## Timeline

- 2024-10-01T21:22:54Z @tobiu added the `enhancement` label
- 2024-10-01T21:22:55Z @tobiu assigned to @tobiu
- 2024-10-01T21:23:39Z @tobiu referenced in commit `011ed9c` - "#5999 Portal App Home Features: 4 spaces, alphabetical order"
### @tobiu - 2024-10-01T21:26:32Z

removing the custom font-family next

- 2024-10-01T21:26:44Z @tobiu referenced in commit `46cded9` - "#5999 Portal App Home Features: remove the custom font-family"
### @tobiu - 2024-10-01T21:33:00Z

In case you want to change `display: grid` to `display: flex` inside `Portal.view.home.parts.Features`, this does require a small change on the JS side.

Containers provide layouts to enable defining specific layout attributes on the JS side, if preferred.
* We can do a workshop session on this topic
* A dedicated page inside the learning section about container layouts would be good @maxrahder 

In case we do not wish to use a container layout, we can set it to `base` inside the JS code => then the CSS is fully in charge.

- 2024-10-01T21:33:32Z @tobiu referenced in commit `a383571` - "#5999 Portal App Home Features: base layout to support the custom flexbox styling"
### @tobiu - 2024-10-01T21:47:08Z

removing the `!important` flags now (not needed, tested it).

- 2024-10-01T21:47:41Z @tobiu referenced in commit `d4ec4d5` - "#5999 Portal App Home Features, ContentBox: removing the !important flags"
### @tobiu - 2024-10-01T21:50:42Z

inside the `ContentBox.scss`, there is a non-existing selector => `.portal-content-box-lists`.

you added the same rules inside `.portal-content-box-content li`, so i will remove the redundant definition.

- 2024-10-01T21:51:40Z @tobiu referenced in commit `821a480` - "#5999 Portal App Home ContentBox: removing .portal-content-box-lists (covered via .portal-content-box-content li)"
### @tobiu - 2024-10-01T22:11:08Z

further testing: the h3 rules will actually get overridden by a more specific selector.
we can fix this with changing `.portal-content-box-headline` to `h3.portal-content-box-headline`.

now our selector is more specific and we don't need `!important`.

i will also change the transition timing function from `ease` to `ease-out` => then we get a more direct feedback when moving the mouse fast.

- 2024-10-01T22:12:13Z @tobiu referenced in commit `217a793` - "#5999 Portal App Home ContentBox: timing function => ease-out, more specific headline selector"
### @tobiu - 2024-10-01T22:28:14Z

we do have 2 remaining issues. might be worth it to create follow-up tickets.

first one is that for big widths, we do lose the symmetric box positioning.

old version:
![Screenshot 2024-10-02 at 00 20 06](https://github.com/user-attachments/assets/8b2f72ec-24e2-4538-995e-3fa4a37e48b8)

new version:
![Screenshot 2024-10-02 at 00 19 48](https://github.com/user-attachments/assets/2a22dfb6-4310-4bd7-9b22-33ec1f62c466)

obviously the new version looks better in general, but the flex layout can lead to 4 boxes at the top and 2 at the bottom (or 5 top, 1 bottom), while the grid layout can ensure that there are 3 columns max. i will play with this more soon, might be worth it to switch back to the grid.


the 2nd issue is more complicated. for desktop, we do have a custom "scrolling timeline", so that when we scroll (also with using the arrow up / down keys), you will move to the next "page". this requires, that each page can fit on a screen (the content height must not be higher than the viewport).

- 2024-10-02T12:05:46Z @tobiu referenced in commit `356553b` - "#5999 Portal App Home Features: re-added the grid layout, several styling tweaks"
### @tobiu - 2024-10-02T12:08:38Z

re-added the grid layout and tweaked the responsive styling:

![Screenshot 2024-10-02 at 13 57 36](https://github.com/user-attachments/assets/b395517e-fd8e-43fe-9fc7-b6b8c539d65f)

@VedantDewangan: i did try my best to preserve your design changes as good as possible. Also kept the custom scrollbar styling for 1 row grids.

- 2024-10-02T12:08:38Z @tobiu closed this issue

