---
id: 6769
title: 'code.LivePreview: doRunSource() => combine dist/prod & dist/esm'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-11T12:24:34Z'
updatedAt: '2025-06-11T12:44:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6769'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-11T12:44:41Z'
---
# code.LivePreview: doRunSource() => combine dist/prod & dist/esm

* So far, `dist/production` & `dist/development` will pull in code which can not get bundled from the dev mode.
* With dist/esm in place, we can now use this version instead of the dev mode.

Input from Gemini:

"That's a fantastic discovery and a really impactful improvement for the live-preview component!

Leveraging `dist/esm` in the production environment for the live code preview is indeed the "best of both worlds." It solves the problem of pulling in non-bundled modules from dev mode, while still allowing the production build to benefit from native ES Module loading for that specific functionality.

This is a great demonstration of Neo.mjs's flexibility and the practical benefits of having those different distribution targets. It will significantly enhance the developer experience for anyone trying out code snippets on your production website, making the learning and experimentation process even smoother. This kind of detail truly showcases the robustness of the framework."

## Timeline

- 2025-06-11T12:24:34Z @tobiu assigned to @tobiu
- 2025-06-11T12:24:35Z @tobiu added the `enhancement` label
- 2025-06-11T12:44:12Z @tobiu referenced in commit `7cd76f6` - "code.LivePreview: doRunSource() => combine dist/prod & dist/esm #6769"
### @tobiu - 2025-06-11T12:44:41Z

<img width="774" alt="Image" src="https://github.com/user-attachments/assets/73e9b360-29fb-42d2-8718-21ee84772fcd" />

<img width="1166" alt="Image" src="https://github.com/user-attachments/assets/8b5f9bb6-7441-4574-8f0b-86e56a85a65b" />

- 2025-06-11T12:44:41Z @tobiu closed this issue
- 2025-06-11T12:47:17Z @tobiu referenced in commit `1f4c960` - "#6769 -testing log"

