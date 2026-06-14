# Incident: Agent Identity Drift — GH_TOKEN + Memory-Core (2026-06-14)

> Forensic record for [#13239](https://github.com/neomjs/neo/issues/13239); forensic complement to [#13234](https://github.com/neomjs/neo/issues/13234) (the canonical-`AgentIdentity` code repair). Captures how one agent's session identity drifted to *another* agent's across both GitHub and the Memory-Core A2A bus, the divergence signature that diagnoses it, and the fix + prevention approach so the next occurrence is fast to resolve instead of silent.

| Attribute | Value |
|---|---|
| **Severity** | Medium — no data loss; mis-attributed authorship + a broken cross-family review gate + an A2A identity collision; operator-visible |
| **Detected** | 2026-06-14 — operator noticed PR [#13233](https://github.com/neomjs/neo/pull/13233)'s opener (`neo-opus-ada`) ≠ its stated author (`@neo-gpt`); confirmed by @neo-gpt's `gh api user` V-B-A from his worktree |
| **Affected** | @neo-gpt (Euclid, GPT-5 / Codex Desktop)'s harness session: PRs [#13233](https://github.com/neomjs/neo/pull/13233) + [#13235](https://github.com/neomjs/neo/pull/13235) (opener mis-attributed) and his Memory-Core A2A from-identity |
| **Acute Containment** | A *different* Claude identity's formal approval cleared #13233's cross-family gate; @neo-gpt added canonical `@identity` lines to the PR bodies as an attribution stopgap |
| **Root Resolution** | ⏳ Pending: the affected harness's session identity-config reset (team-owned) + the detection seam in [#13234](https://github.com/neomjs/neo/issues/13234). Until detection lands, recurrence is **silent** until a human notices a mis-attributed artifact. |
| **Author** | Claude Opus 4.8 [1M context] (Claude Code) as @neo-opus-ada |
| **Origin Session ID** | `4c598c8f-d8a7-4288-9420-e825a45d310e` |

## Summary

During this session @neo-gpt (Euclid) opened PRs #13233 and #13235 whose **GitHub opener was `neo-opus-ada`** (my identity) while the **commit author was correctly `neo-gpt`**. The same drift extended to the **Memory-Core A2A bus**: his agent-to-agent messages arrived *from* `neo-opus-ada`, and `mark_read` rejected his attempts on `@neo-gpt`-addressed messages "as unauthorized for the recipient" — he and I were colliding as the same identity.

The failure was **silent**: nothing warned that a PR was being opened, or an A2A sent, under the wrong identity. It surfaced only when a human noticed the opener/author mismatch. Downstream harm: mis-attributed authorship; a broken cross-family review gate (GitHub blocks self-review, so I — the *real* `neo-opus-ada` — could not formally approve "my own" PRs that were actually Euclid's); and an A2A bus collision.

The git commit author was never wrong — which is the key diagnostic: **the drift is in the *identity token*, not the *git config*.**

## Mechanism — two identities, one drifted source

A PR (and an agent op generally) carries **two independent identities** from **two sources**:

| Identity | Source | This incident |
|---|---|---|
| **Commit author** | git config `user.name` / `user.email` (per checkout) | `neo-gpt` — correct |
| **PR opener / GitHub API** | the gh auth **token** | `neo-opus-ada` — **drifted** |
| **Memory-Core A2A from-identity** | the session identity-source | `neo-opus-ada` — **drifted** |

The GitHub-token resolution is the crux:

- `gh` resolves its token from the **`GH_TOKEN` env var first**, which **overrides** any `gh auth login` stored credential. A stray / inherited `GH_TOKEN` therefore silently wins.
- The **github-workflow MCP shares this token** — `GraphqlService.#getAuthToken()` runs `gh auth token` (the same gh resolution). So a wrong `GH_TOKEN` corrupts **both** the MCP tools (`manage_pr_review`, `create_issue`, …) **and** the raw `gh` CLI (`gh pr create`, `gh api`) **identically** — one assertion can therefore cover both.

So when the affected harness's `GH_TOKEN` (or the upstream env/config that set it) held a different agent's PAT, every GitHub write authenticated as that agent, while the commit — set by the separate git config — stayed correct. The Memory-Core A2A identity drifted from the same root identity-config, extending the mis-identification to the bus.

## Diagnostic Runbook — recognize + confirm

**Symptom signature** (any one is a flag; together they confirm):

- A PR's **opener login ≠ its commit author** (or ≠ the body's declared `@identity`).
- A2A messages arrive **from the wrong agent identity**.
- `mark_read` / recipient-scoped ops reject **"unauthorized for the recipient"** for messages addressed to the agent's *real* identity.

**Confirm (copy-paste, run in the affected checkout):**

```bash
gh api user --jq .login          # the GitHub *token* identity (= the PR opener)
git config user.email            # the *commit* identity
gh auth status                   # shows "(GH_TOKEN)" when the env var is the live source
```

**Verdict:** if `gh api user` ≠ the expected agent's GitHub login *while* `git config` is correct, the **`GH_TOKEN` has drifted** — that is the bug, not git config. The `gh auth status` `(GH_TOKEN)` annotation confirms the env var (not `gh auth login`) is the live source.

**Scope the window:** list PRs the wrong identity *authored* but whose commits are by the real agent — those are the mis-attributed set:

```bash
for n in $(gh pr list --author <drifted-login> --state all --limit 12 --json number --jq '.[].number'); do
  echo "#$n commits: $(gh pr view $n --json commits --jq '[.commits[].authors[0].login]|unique|join(",")')"
done
# rows whose commit author != <drifted-login> are the mis-attributed PRs (here: exactly #13233, #13235)
```

## Fix Approach

1. **The fix that resolved this incident: a harness restart.** Restarting the affected harness re-derived its identity from the correct source — empirically the fastest repair (`@neo-gpt` recovered this way). **Verify across surfaces afterward** — post-restart, every one must report the *true* agent, not the drifted one:

   ```bash
   gh api user --jq .login                  # == expected agent (the GitHub token identity)
   ```
   - Memory-Core healthcheck: `identity.bound=true`, `identity.nodeId=@<agent>`.
   - Memory-Core self-DM probe: stamps `from @<agent>`, and `mark_read` works again (while drifted it rejected the agent's own messages "unauthorized for the recipient").
   - github-workflow MCP `manage_issue_comment` — and a `manage_pr_review` **`COMMENT`** probe (`COMMENT` does not mutate review state, unlike `APPROVED`/`CHANGES_REQUESTED`) — stamp as `@<agent>`.

2. **Root prevention (so the restart isn't needed again): per-agent `GH_TOKEN` isolation.** The drift vector is `GH_TOKEN` *precedence* — it overrides `gh auth login`, so a stray / inherited token silently wins. Ensure each harness exports only its own PAT and nothing upstream leaks a different one into its env. (Team / operator-owned, per harness.)

3. **Attribution stopgap** (apply *while* drifted): a canonical `@identity` line in the PR / review *body* keeps authorship readable to humans + the GoldenPath reporting layer (the [#13237](https://github.com/neomjs/neo/pull/13237) gate-fix resolves cross-family *eligibility* from it). **But it does not restore GitHub's native formal review gate** — the self-review check keys on the *opener login*, not the body, so a cross-family `reviewDecision: APPROVED` still needs a different-family identity (or a human merge) until the token is reset.

4. **Contamination is permanent for artifacts created while drifted.** A mis-attributed PR opener is fixed at create-time; an old review / A2A object stays stamped with the drifted identity even after the harness is repaired. Re-attribution is not cleanly possible — the body `@identity`, a shell-authored correction comment, and this record are the durable attribution markers for those artifacts.

## Prevention — make it loud, not silent

The root failure class is the same as the Chroma query swallow in [#12450](https://github.com/neomjs/neo/issues/12450): **a real failure erased into a clean-looking result instead of surfaced.** A wrong identity should not silently produce a valid-looking PR.

Recommended detection seam (code implementation rides [#13234](https://github.com/neomjs/neo/issues/13234)):

- **Session-start / healthcheck assertion** — the github-workflow healthcheck already verifies `gh auth status`; extend it to assert `gh api user --jq .login` **and** the Memory-Core self-identity **== the expected per-agent identity** (canonical, from `ai/graph/identityRoots.mjs`). On mismatch → `degraded` + an explicit `"identity drift: authed as X, expected Y"`. Catches a drifted token **before any write**.
- **Write-boundary guard (defense-in-depth)** — the MCP write tools already gate on `viewerPermission`; add the same identity-match as a fail-closed precondition. For the `gh pr create` path (not routed through the MCP), a one-line pre-flight assertion before create.

One assertion covers GitHub + the MCP because they share the gh-token; the Memory-Core check is the second surface.

**The complete defense is three-part; the detection above is the loud-failure net under it:**

1. **`GH_TOKEN` isolation** — the root (Fix Approach §2): each harness exports only its own PAT. Stops the drift at the source. Per-harness *discipline* instance (codified for Codex in [#13241](https://github.com/neomjs/neo/issues/13241) / PR [#13242](https://github.com/neomjs/neo/pull/13242)): keep identity-sensitive worktrees under the harness clone root so the shell resolves the right per-agent `.env` / PAT, plus an identity preflight (`gh api user --jq .login == <agent>`) after a worktree/thread switch before any state-changing GitHub call. The cross-harness generalization (Claude / Gemini equivalents) is the open follow-up surface.
2. **Canonical-emit** — every PR / review body carries the agent's `@identity` line (`pull-request-workflow.md` §5), so authorship is machine-readable even when the opener login is wrong.
3. **Gate-hardening** — the cross-family review gate resolves author *family* from that body `@identity`, not the opener login ([#13237](https://github.com/neomjs/neo/pull/13237)), with a **line-anchored** parser (`/^Authored by[^\n]*?@([\w-]+)/m`). The `^…/m` anchor is load-bearing: a naive `/Authored by/` overmatches the `Co-Authored-By` trailer, and real bodies place the self-id mid-document (after `Resolves #N`), so a non-multiline match misses it entirely.

## Related

- [#13234](https://github.com/neomjs/neo/issues/13234) — the canonical-`AgentIdentity` code repair + the detection-seam implementation (where the prevention above lands as code).
- [#12450](https://github.com/neomjs/neo/issues/12450) — sibling silent-failure anti-pattern (a real failure erased into a clean result instead of surfaced).
