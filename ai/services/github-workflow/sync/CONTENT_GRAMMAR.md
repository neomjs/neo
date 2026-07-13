# Synced Content Markdown Grammar

Single source of truth for the markdown structure the gh-workflow syncers emit for **Issues**, **Pull Requests**, and **Discussions** — so downstream consumers (notably the portal news view parsers `Portal.view.news.{tickets,pulls,discussions}.Component`) don't re-derive, and mis-derive, it.

Verified against the emit code (`PullRequestSyncer.mjs`, `DiscussionSyncer.mjs`, `IssueSyncer.mjs`) and corpus samples (`pr-105.md`, `discussion-11089.md`, `issue-9.md`).

## Common rules

- Each file is `gray-matter` frontmatter followed by a markdown body.
- The body opens with a `## Description` section (the item's own body text); type-specific sections follow.
- Conversation entries are delimited by their `###` header. **Never split on a bare `---`** — horizontal rules appear inside entry bodies.
- Timestamps are ISO-8601 UTC (`<ISO_Z>`, e.g. `2026-05-10T01:43:13Z`).

## Issues — `IssueSyncer`

- Frontmatter: `number, title, state` (`OPEN`|`CLOSED`), `labels[], author, createdAt, updatedAt, closedAt, parentIssue, subIssues[]`.
- Sections: `## Description`, then `## Timeline`.
- `## Timeline` interleaves:
  - **Events** — `- <ISO_Z> @user <action>` (e.g. `created the issue`, ``added the `bug` label``, `closed this issue`, ``referenced in commit `<sha>` ``, `cross-referenced by PR #N`).
  - **Comments** — a `### @user - <ISO_Z>` header, then comment markdown until the next header.

## Pull Requests — `PullRequestSyncer`

- Frontmatter: `number, title, state` (`OPEN`|`MERGED`|`CLOSED`), `author, createdAt, updatedAt, closedAt, mergedAt` (null if never merged), `base, head, url`.
- Sections, in order, each optional: `## Description`, `## Comments`, `## Reviews`, `## Commits`, `## Files Changed`.
  - `## Comments` entries: `` ### `@user` commented on <ISO_Z> ``
  - `## Reviews` entries: `` ### `@user` (<STATE>) reviewed on <ISO_Z> `` — `STATE` ∈ `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED` (treat unknown as neutral).
  - `## Commits`: `` - `<sha>` <message> (by <author>) `` lines.
  - `## Files Changed`: a `` | `<file>` | +<adds> | -<dels> | `` table.
- `## Comments` and `## Reviews` are **separate sections, not globally time-ordered** — a unified timeline must merge-sort by timestamp.
- Common case: a PR with no review/comment activity (e.g. dependabot) has only `## Description`.

## Discussions — `DiscussionSyncer`

- Frontmatter: `number, title, author, category` (`Ideas`|`General`|`Q&A`|…), `createdAt, updatedAt, closed` (boolean), `closedAt`, and the source-owned `routingDispositionSchemaVersion, routingDisposition, routingDispositionReason, routingDispositionEvidence`. No `state`, no `labels`; raw timestamps are observability and never routing-liveness authority.
- Sections: `## Description`, then `## Comments`.
- `## Comments` entries: `` ### `@user` commented on <ISO_Z> `` — the backtick form, **like PRs, not** the issue `- <ts> @user` event form.
- Threaded replies follow their parent comment, each headed `` #### Reply depth=<N> by `@user` on <ISO_Z> `` with raw reply markdown after the header. Parent association is lexical: a reply belongs to the preceding top-level comment until the next top-level `` ### `@user` commented on <ISO_Z> `` header.
- Legacy flattened reply blocks headed `` > **Reply by `@user`** on <ISO_Z> `` remain readable as part of the parent comment body; consumers must not split on those legacy blockquotes.
- Accepted answers are emitted as GitHub-style callouts (`> [!ANSWER]`) before accepted top-level comments or accepted replies.

## Quick reference — entry header by type

| Type | Section | Entry header |
|---|---|---|
| Issue event | `## Timeline` | `- <ISO_Z> @user <action>` |
| Issue comment | `## Timeline` | `### @user - <ISO_Z>` |
| PR comment | `## Comments` | `` ### `@user` commented on <ISO_Z> `` |
| PR review | `## Reviews` | `` ### `@user` (<STATE>) reviewed on <ISO_Z> `` |
| Discussion comment | `## Comments` | `` ### `@user` commented on <ISO_Z> `` |
| Discussion reply | Parent discussion comment | `` #### Reply depth=<N> by `@user` on <ISO_Z> `` |

## Consumers

- `Portal.view.news.tickets.Component` — issues (exists).
- `Portal.view.news.pulls.Component` — pull requests (#12213).
- `Portal.view.news.discussions.Component` — discussions (#12211).

When changing the emitted grammar, update this file and the affected parser(s) in the same change.
