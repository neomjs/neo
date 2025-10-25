---
id: 7298
title: A Beginner's Guide to View Controllers
state: OPEN
labels:
  - help wanted
  - good first issue
  - Blog Post
  - hacktoberfest
assignees: []
createdAt: '2025-09-28T12:50:27Z'
updatedAt: '2025-10-24T16:28:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7298'
author: tobiu
commentsCount: 7
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# A Beginner's Guide to View Controllers

**Reported by:** @tobiu on 2025-09-28

---

**Parent Issue:** #7296 - Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

---

View Controllers are a key architectural concept in Neo.mjs, but we lack beginner-focused content explaining their role.

The goal of this ticket is to write a blog post that introduces View Controllers from a newcomer's perspective.

### Tasks:

1.  Create a new markdown file in the `learn/blog/` directory.
2.  Choose an existing example (e.g., the default app from `npx neo-app`) to use as a reference.
3.  Explain the purpose of a `ViewController` and how it's connected to a view.
4.  Demonstrate how to add a simple event listener within the controller.
5.  Explain the benefits of separating view logic into a controller.

## Comments

### @Rupa-Rd - 2025-09-28 14:48

@tobiu Can you assign this issue to me? I want to work on it.

### @tobiu - 2025-09-28 15:01

Sure, thanks for your interest. Hint: do not submit PRs before October 1st, to ensure they count for the event.

View Controllers are a nice item, since they showcase how to separate business logic in a smart way: not dropping event handlers into components.

I am curious: are you planning to try out the "ai native" workflow?

### @Rupa-Rd - 2025-09-28 15:32

Thank you for assigning the issue. I would like to try out the AI workflow. Can you share the relevant document on how to set it up? The [link](https://github.com/neomjs/neo/issues/created_by/AI_QUICK_START.md) is navigating to an invalid file.

### @tobiu - 2025-09-28 15:37

thanks for the heads up! there was indeed a relative link inside the epic. i fixed it now with an absolute path:
https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md

### @tobiu - 2025-09-29 09:46

I just finished this one:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md

Hope it helps!

### @tobiu - 2025-10-24 10:04

unassigning the ticket after close to a month of inactivity.

### @sakirr05 - 2025-10-24 16:28

heyy i would love to contribute on it, can you please assign it to me??


