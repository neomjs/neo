---
id: 5302
title: 'learning content: TT tags replacement'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-03-05T17:14:59Z'
updatedAt: '2024-03-18T16:49:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5302'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-18T16:49:42Z'
---
# learning content: TT tags replacement

not a high prio one, but `<TT>` is deprecated:
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/tt

we could e.g. go for `<SAMP>`:
https://developer.mozilla.org/en-US/docs/Web/HTML/Element/samp

thoughts @mxmrtns @ExtAnimal @maxrahder ?

## Timeline

- 2024-03-05T17:14:59Z @tobiu added the `enhancement` label
### @siddhubvs - 2024-03-18T15:02:38Z

Can you tell me the components where could i find those <TT> tags in the project

### @tobiu - 2024-03-18T16:49:42Z

hi @siddhubvs!

apologies, @maxrahder seems to have already removed the TT tags and not updated this ticket. i spend a while to find the spot: https://github.com/neomjs/neo/commit/0b55bb0bbfa44bc931c9c8705b8d3a8ae317de90#diff-af14b33d36f92d1b62e3af79187da78fc1ab32c94e45f8b640c73b844b3fc514L322

in case you would like to work on neo related tickets, i strongly recommend to join the slack channel. @maxrahder can help you getting up to speed (e.g. doing weekly workshops).

best regards, tobi

- 2024-03-18T16:49:42Z @tobiu closed this issue

