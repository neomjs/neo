---
id: 7474
title: Improve AI Query Scoring to Boost Content Matches
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-13T09:20:44Z'
updatedAt: '2025-11-02T09:29:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7474'
author: tobiu
commentsCount: 1
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-02T09:29:29Z'
---
# Improve AI Query Scoring to Boost Content Matches

The AI query system (`queryKnowledgeBase.mjs`) currently uses a hybrid approach of semantic vector search followed by a keyword-based scoring boost. However, the keyword boosting logic has a significant flaw: it only checks for keywords in a chunk's metadata (e.g., filename, title, path) and completely ignores the chunk's actual `content`.

This leads to counter-intuitive results. For example, a query for the word "Tron" correctly identifies the blog post `ai-native-platform-answers-questions.md` (which contains the word in its content) through semantic search. However, it ranks it lower than other articles that are semantically related but do not contain the word at all. This is because those other articles get higher initial semantic scores, and the target article gets no keyword boost to compensate, as the current logic doesn't reward it for having a literal match in its content.

This ticket is to fix the scoring algorithm to give a significant boost to any chunk where the search term is found directly in the content.

## Acceptance Criteria

1.  The `queryKnowledgeBase.mjs` script must be modified.
2.  Inside the keyword scoring loop (`queryWords.forEach`), a new condition must be added.
3.  This condition will check if the `keywordSingular` exists within the chunk's `content` (e.g., `metadata.content.toLowerCase().includes(keywordSingular)`).
4.  If a match is found, a substantial score boost (e.g., `score += 100`) should be applied. This boost should be high enough to ensure a literal content match is prioritized over a purely semantic one.
5.  After the change is implemented, running the command `npm run ai:query -- -q "Tron" -t blog` must rank `/Users/Shared/github/neomjs/neo/learn/blog/ai-native-platform-answers-questions.md` as the top result.

## Timeline

- 2025-10-13T09:20:44Z @tobiu assigned to @tobiu
- 2025-10-13T09:20:45Z @tobiu added parent issue #7296
- 2025-10-13T09:20:46Z @tobiu added the `enhancement` label
- 2025-10-13T09:20:46Z @tobiu added the `help wanted` label
- 2025-10-13T09:20:46Z @tobiu added the `good first issue` label
- 2025-10-13T09:20:46Z @tobiu added the `hacktoberfest` label
- 2025-10-13T09:20:47Z @tobiu added the `ai` label
### @tobiu - 2025-10-13T09:22:02Z

I am reserving this ticket for @SarthakBorude for 7 days.

- 2025-10-13T09:34:46Z @tobiu cross-referenced by #7467
- 2025-11-02T09:29:30Z @tobiu closed this issue

