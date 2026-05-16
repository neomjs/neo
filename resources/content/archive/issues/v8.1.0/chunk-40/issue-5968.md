---
id: 5968
title: Improve the design of the new Neo.mjs website
state: CLOSED
labels:
  - help wanted
  - good first issue
  - hacktoberfest
  - design
assignees: []
createdAt: '2024-09-24T15:29:45Z'
updatedAt: '2024-11-02T13:01:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5968'
author: tobiu
commentsCount: 4
parentIssue: 5963
subIssues:
  - '[x] 6022 Improvement Design ofFooter Section'
  - '[x] 6024 Improvement Blog page''s design and layout'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2024-11-02T13:01:18Z'
---
# Improve the design of the new Neo.mjs website

Related to: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

A call to all designers who would like to participate in hacktoberfest.

Since we literally just released the new framework website:
https://neomjs.com/dist/production/apps/portal/#/home

We are highly interested in your thoughts. If you spot specific areas where we can do better, this is definitely worth a PR for each spot which you identify.

Thanks and best regards,
Tobias

## Timeline

- 2024-09-24T15:29:45Z @tobiu added the `help wanted` label
- 2024-09-24T15:29:45Z @tobiu added the `good first issue` label
- 2024-09-24T15:29:45Z @tobiu added the `hacktoberfest` label
- 2024-09-24T15:29:45Z @tobiu added the `design` label
### @sowunmi-mayowa - 2024-09-24T21:02:57Z

![{92F18A89-0186-4709-9064-127995C94E7E}](https://github.com/user-attachments/assets/39844554-1e76-41cf-b59b-bc521cca0a7d)
Implementing something like this in the cards section would be a nice idea
What do you think?

### @VedantDewangan - 2024-09-30T23:53:59Z

Hi Tobias,

I'd love to contribute to improving the design of the new Neo.mjs website for Hacktoberfest. After reviewing the website, I noticed a few areas where enhancements could be made, particularly on the homepage and blog sections.

For example, I believe the cards on the homepage and blog page could benefit from a more polished design. Additionally, I have some ideas to improve the filter search input on the blog page for a better user experience.

I'd be happy to submit PRs addressing these areas. Please let me know if that sounds good, and I'll start working on it right away.

### @tobiu - 2024-10-01T00:57:33Z

hi guys,

good ideas are always welcome. I recommend that you create smaller new specific tickets and i can assign them to you. Even small concepts are worth PRs.

Feel free to jump into the slack channel, in case you need input on how to work with the theming engine.

In short:
* fork the repo
* npm i
* npm run build-all (which includes a themes build for all themes)
* then you can use `npm run watch-themes` which will compile all changes in existing files into their CSS file counterpart
* when creating a new file, we need to run `npm run build-themes` to get it into the theme maps (json). afterwards the watcher works again

mostly these 2 folders:
https://github.com/neomjs/neo/tree/dev/resources/scss/src/apps/portal
https://github.com/neomjs/neo/tree/dev/resources/scss/theme-neo-light/apps/portal

the portal app is only using the new (and not finished) `theme-neo-light`.

### @tobiu - 2024-11-02T13:01:18Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T13:01:18Z @tobiu closed this issue

