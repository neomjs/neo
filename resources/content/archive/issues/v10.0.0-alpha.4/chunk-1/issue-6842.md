---
id: 6842
title: Neo.config.useStringBasedMounting => useDomApiRenderer
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-19T11:06:56Z'
updatedAt: '2025-06-19T11:27:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6842'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-19T11:27:49Z'
---
# Neo.config.useStringBasedMounting => useDomApiRenderer

* The new name is more clear and with the default set to true more positive.

Gemini:

That's a fantastic "side quest" to dive into! Renaming Neo.config.useStringBasedMounting to something like useDomApiRenderer is a smart move, especially during an alpha stage, as it can significantly improve clarity and intent.

Let's explore the implications and benefits of useDomApiRenderer: true.

Exploring Neo.config.useDomApiRenderer: true
Current State:

useStringBasedMounting: false
This config means "do NOT use string-based mounting", which implicitly means "use DOM API based mounting". It's a double negative that can be slightly confusing.
Proposed Name: useDomApiRenderer

Clarity and Intent:

Pro: useDomApiRenderer: true directly states the preferred and active rendering strategy. It's a positive affirmation. When a developer sees true, they immediately know the application is leveraging the direct DOM API approach. This is much clearer than useStringBasedMounting: false.
Pro: It focuses on the new, optimized, and secure mechanism, which is the direction v10 is heading, rather than focusing on the legacy fallback.
Default Value Alignment:

Pro: If the default for v10 is to use the DOM API renderer, then useDomApiRenderer: true as the default value aligns perfectly with the name and the desired behavior. This is clean and intuitive.
Future-Proofing (Minor Consideration):

Neutral: While it's excellent for the current two modes, if Neo.mjs were to introduce a third, fundamentally different rendering strategy in the distant future (e.g., a WebGL-based UI renderer, though less likely for general VDom), a boolean flag might become less descriptive. However, for the current and foreseeable future (DOM API vs. String-based), useDomApiRenderer is highly effective. If a third mode truly emerged, a string-based renderingStrategy: 'domApi' | 'stringBased' | 'webGl' might be considered then, but it adds complexity for what is currently a boolean choice.
Consistency:

Pro: It fits well with existing use*Worker flags (useCanvasWorker, useTaskWorker, useVdomWorker). It clearly indicates "enable/use this specific feature/component."
Recommendation:

I strongly recommend renaming Neo.config.useStringBasedMounting to Neo.config.useDomApiRenderer with its default set to true (assuming this is the desired default for v10).

This change will make the configuration much more intuitive and directly communicate the preferred, secure, and performant rendering strategy to developers. It aligns with the "Quantum Leap" narrative of v10.

## Timeline

- 2025-06-19T11:06:56Z @tobiu assigned to @tobiu
- 2025-06-19T11:06:58Z @tobiu added the `enhancement` label
- 2025-06-19T11:27:46Z @tobiu referenced in commit `8930d63` - "Neo.config.useStringBasedMounting => useDomApiRenderer #6842"
- 2025-06-19T11:27:49Z @tobiu closed this issue

