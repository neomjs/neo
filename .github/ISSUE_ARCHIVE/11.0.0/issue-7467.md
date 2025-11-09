---
id: 7467
title: '`ai:query` fails to find content in existing blog post'
state: CLOSED
labels:
  - bug
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - harikrishna-au
createdAt: '2025-10-12T11:08:06Z'
updatedAt: '2025-10-22T22:52:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7467'
author: tobiu
commentsCount: 3
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-13T09:34:45Z'
---
# `ai:query` fails to find content in existing blog post

**Reported by:** @tobiu on 2025-10-12

---

**Parent Issue:** #7296 - Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

---

The `npm run ai:query` command is failing to find content that is confirmed to exist in a file within the `/learn/blog/` directory. This failure occurs both in general searches and when specifically filtering with `-t blog`. This points to a potential bug in the knowledge base indexing process (`createKnowledgeBase.mjs` or `embedKnowledgeBase.mjs`) or the query filtering logic (`queryKnowledgeBase.mjs`).

## Contributor Guidance

This ticket is a good candidate for **Hacktoberfest**. To solve this, you **must** use the project's "AI-Native" workflow. This involves using an AI agent (like Gemini CLI) to help you diagnose and fix the issue.

Please read the following guides before starting:
-   [Working with Agents](https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md)
-   [AI Quick Start Guide](https://github.com/neomjs/neo/blob/dev/.github/AI_QUICK_START.md)

The agent will help you explore the relevant files (`createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`), understand the code, and formulate a fix.

---

## Steps to Reproduce

1.  Verify that the file `/Users/Shared/github/neomjs/neo/learn/blog/ai-native-platform-answers-questions.md` contains the word "Tron".
2.  Run the command: `npm run ai:query -- -q "Tron" -t blog`

### Observed Behavior

The query returns the message: "No results found for your query and type."

### Expected Behavior

The query should return `/Users/Shared/github/neomjs/neo/learn/blog/ai-native-platform-answers-questions.md` as a relevant result.

## Impact

This bug severely reduces the reliability of the AI knowledge base. It can lead to confusing and incorrect agent interactions, as the agent is unable to find information that is known to exist in the project. This undermines the core "Anti-Hallucination Policy" defined in `AGENTS.md`.

## Initial Analysis

The `queryKnowledgeBase.mjs` script contains the following filter logic:

```javascript
case 'blog':
    return source.includes('/learn/blog/');
```

Given that the file path matches

## Comments

### @SarthakBorude - 2025-10-12 18:58

hey i am a beginner and i would love to give it a try 


### @harikrishna-au - 2025-10-13 02:01

Hi @tobiu, apologies for not asking to be assigned to this issue beforehand. I’ve submitted a PR with the fix. Please have a look and let me know if any changes are needed. Thank you!

### @tobiu - 2025-10-13 09:34

> ✦ Hi @harikrishna-au and @SarthakBorude, and thank you both for your engagement on this ticket.
> 
>   First, thank you @harikrishna-au for the quick and effective PR. We have reviewed, approved, and merged it, and the bug is now resolved.
> 
>   I want to take a moment to clarify our contribution workflow to ensure fairness and prevent duplicate work, especially during a busy time like Hacktoberfest. As a general guideline, please comment on an issue and wait for it to be assigned to you by a maintainer before you begin working. This helps us ensure that multiple people aren't unknowingly working on the same problem.
> 
>   In this case, since a complete PR was already submitted, we made the practical decision to merge it. Asking someone to re-do work that is already complete would not be a good use of a contributor's valuable time.
> 
>   @SarthakBorude, we really appreciate you volunteering for this. To ensure you have a great opportunity to contribute, we've created a follow-up ticket that addresses a related improvement we discovered during the review. We have created and reserved it specifically for you: #7474
> 
>   Important: Due to GitHub's assignment policy, I can only assign the ticket to you after you've commented on it. Please leave a comment on the new issue (e.g., "Ready to start!") within the next 7 days, and I will officially assign it to you.
> 
>   We're thrilled to have such high interest in the project and look forward to collaborating with all of you.

