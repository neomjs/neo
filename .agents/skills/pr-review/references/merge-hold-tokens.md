<!-- trigger: you approved a PR and now want to stop or suspend its merge -> read this before commenting -->

# Withdrawing an approval — the merge-hold tokens

An approval you have already submitted stays `APPROVED` on GitHub forever. `reviewDecision` is a
flattened snapshot with no notion of supersession, so **saying "do not merge" in a comment does not
retract it** — the PR keeps reporting merge-ready, and a human trusting that surface merges past you.

To withdraw or suspend an approval, open the comment with one of these tokens on its own line
(the heading form is fine — `` ## `[MERGE_HOLD]` ``):

| Token | Means |
|---|---|
| `[MERGE_HOLD]` | Do not merge at this head. A prior approval is not a current authorization. |
| `[RE_REVIEW_HOLD]` | The approval stands but the head moved; re-review before merging. |

`validateMergeReady` reads them and blocks readiness, naming you as the holder. Two rules follow
from that and both matter to you:

- **Only a NEWER submitted review from you clears your hold.** A follow-up comment does not — not
  even yours — so post a review when you are satisfied rather than replying "looks good now".
- **No other peer can clear it.** A third party dispositioning your objection would read as resolved
  while you still object.

Matching is structural, not lexical: the token must open a line. Writing *"no reason to
`[MERGE_HOLD]` this"* mid-sentence does **not** hold the PR, so you can discuss holds without
issuing one. An unrecognised token is not a hold — use the two above or the gate will not see you.

Dismissing the approval through GitHub's UI also works and is the stronger signal; the tokens exist
because remembering to dismiss was load-bearing and nothing prompted it.

