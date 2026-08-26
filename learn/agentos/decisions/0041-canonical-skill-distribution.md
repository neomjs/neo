# ADR 0041: Canonical Skill Distribution — an External Anchor and Two Axes That Are Not One

> ⚠️ **Transport and freshness are RESCINDED (2026-08-26) and open at D#17756.** Do not cite this ADR as authority for how substrate reaches a consuming repository, or for what makes a consumer current. What stands: the canonical store, the external-anchor principle, the two-axis separation, the constitution exclusion, the CI-not-hook seat, and enrollment as a predicate.

> The agent skill substrate has **one canonical store**, `neomjs/neo-agent-skills`. Repo distribution
> and harness exposure are **two axes**: no repo gets a curated subset, while each harness receives the
> manifest-declared projection — a guard conflating them either rejects every legitimate harness view
> or accepts real forking. Verification anchors to an authority **outside** the consumer, because a
> hash compared against a locally-editable expectation proves only internal consistency. The receipt
> covers the skill tree, the manifest, and the public facts schema/renderer, and explicitly **excludes
> the maintainer constitution**. Enforcement is reusable CI, never a hook, and the guard never executes
> consumer content. Enrollment is a registry predicate — never a hardcoded population.
>
> **How substrate REACHES a consumer, and what makes a consumer CURRENT, are not decided here.**

| Attribute | Value |
|---|---|
| **Status** | Proposed — reverted from Accepted on 2026-08-26 |
| **Why not Accepted** | §1 (transport) and §2's pinned-revision resolution are **rescinded by the author**: the operator rejected byte-copies into consuming repos (`SSOT violation`, neomjs/devindex#6), and @neo-gpt demonstrated that pinned-per-repo permits *behind-forever* — reproduced independently. The remaining sections stand as written. Transport and freshness are back at D#17756; this ADR is not authority for either until that converges. |
| **Author** | Grace (@neo-opus-grace), recording the D#17756 convergence; contract authored by the swarm — Vega's A4 composition row and its concession, Euclid's A5 schema-bounded reshape and §5.2 Step-Back, Emmy's A6 custody flip and the enforcement-anchor falsifier, the operator's SSOT ruling |
| **Resolves** | The `Required: ADR` gate on #17784 |
| **Graduated from** | Discussion #17756 — §6.2 family-keyed quorum: Claude `[AUTHOR_SIGNAL]` + GPT `[GRADUATION_APPROVED]` (non-author family) at `discussioncomment-18153813`, body `updatedAt 2026-08-25T21:13:40Z` |
| **Amends** | ADR 0040 §2.7 — confirms its separation principle; supplies the contributor-file / projected-constitution boundary it left underspecified |
| **Depends on** | D#17644 (the seat/session layer the maintainer constitution projects into) · #17783 (enforcement custody: required-status-check binding) |
| **Revalidation** | `gemini` and `kimi` were `operator_benched` at quorum. On `participationStatus → active`, this contract is re-presented for retroactive signal — enforced by `check-revalidation.mjs`, not recorded as a promise |

## The problem

Skill substrate changes at **181 commits across 62 distinct days per 90-day window**, and nothing kept
consuming repositories current. The failure mode was never staleness — it was *invisible* staleness.
`neomjs/devindex` was not behind: it carried a hand-copied `AGENTS.md` differing in **8 hunks, two of
them semantic**, and **no `.agents/skills` at all**. An agent working there ran an older constitution
and a missing skill set, and no instrument reported either.

The target population was itself wrong for most of the Discussion. The contract was priced against
"21 repositories" until a live census returned **52** (44 public / 8 private, 4 forks, 48
owned-non-fork). Every cadence and blast estimate had been computed over the wrong set — which is why
this ADR forbids hardcoded populations rather than merely discouraging them.

## Decisions

### §1 Transport ~~is committed bytes~~ — **RESCINDED, unresolved**

> **This section is withdrawn.** D#17782 states the model as *"neo, neo-agent-brain, devindex **consume** `neomjs/neo-agent-skills` **at pinned revisions**"* — consume, not copy. I never read that line while citing the discussion in three PR bodies, and instead recorded Vega's row B6 (bot-synced committed copies, adopted at swarm quorum) as an operator ruling. The operator's *"over-provisioning fine"* licensed **not curating per-repo subsets**, not duplicated bytes. The text below is kept only as the record of what was tried and rejected.

**Original text, rejected:**

The canonical tree is committed in `neomjs/neo-agent-skills` and bot-synced as **committed bytes** to
each enrolled repo, at the identity path `.agents/skills` — so a sync is a directory copy and
byte-equality is a plain diff, with no path mapping for a guard to get wrong.

**Install-time materialization is falsified, not merely disfavoured.** `npm ci --ignore-scripts` is
already deliberate practice in three `neomjs/neo` workflows, two carrying comments that it exists to
skip a heavy postinstall. We have `prepare`, not `postinstall`, and `--ignore-scripts` skips both. An
install-time tree yields **zero skills, silently, with no error** — the exact invisible-absence
failure this ADR exists to close, reintroduced by its own transport.

### §2 The anchor is external, or it is not an anchor

> **Partially rescinded.** The *external-anchor* principle stands and is load-bearing. Its **pinned-revision resolution does not**: a consumer pinned to an older canonical revision verifies green against what canonical published *then*, so N consumers can sit at N historical pins, each independently green, indefinitely. Reproduced 2026-08-26: a consumer pinned to `canonical@243157ffd5` (tree `13d8e935…`) reported GREEN while canonical published `e31730b7…`. That is invisible staleness reproduced inside the mechanism built to eliminate it. Whether SSOT means pinned-per-repo (*may be behind, never different*) or floating (*may never be behind*) was flagged in D#17756 as the one genuine ambiguity and then resolved unilaterally in favour of pinned. It returns to D#17756.

The `AGENT_SUBSTRATE_REVISION` receipt pins the tree by content-addressed hash. Consumer CI resolves
the **expected** hash from canonical's own git history at the consumer's pinned `canonicalRevision`.

**A content-addressed hash is an equality proof only when the expected value comes from an authority
the change under test cannot rewrite.** The first implementation compared a consumer-controlled tree
against a consumer-controlled receipt field; a commit editing a synced skill *and* re-signing its own
`subject.skillTreeHash` satisfied both sides and reported green. The guard must fail closed when the
anchor is unreachable — a missing anchor is RED, never a quiet degradation to self-attestation.

### §3 Two axes, and conflating them breaks both

| axis | rule |
|---|---|
| **Repo distribution** | every enrolled repo carries the same canonical tree — **no per-repo subsets** |
| **Harness exposure** | each harness receives the **manifest-declared** projection — per-harness subsets are legitimate |

A façade differing from the canonical tree is *legitimate*; a façade differing from the *manifest* is
drift. A guard conflating the two either rejects every real harness view or accepts real forking.
Projection is exact — `present − projected`, not `present ∩ optedOut`: an entry absent from the
manifest entirely is as much a violation as an exposed opt-out.

Per-skill links rather than one directory link, because **you cannot opt a skill out of a directory
symlink** — a single link would foreclose the projection axis permanently.

### §4 The receipt's subject excludes the constitution

The receipt covers the skill tree, the manifest, and the **public** facts schema/renderer/clauses. It
does **not** cover the maintainer constitution, which keeps its own revision authority in the D#17644
/ Brain substrate. Without that exclusion stated, the receipt would re-import at the bundle level
exactly the layer violation ADR 0040 §2.7's amendment removes at the file level.

### §5 The enforcing seat is CI, never a hook

`check-chore-sync.mjs` and `mergeInheritance.mjs` honour `--no-verify`, so a hook is feedback rather
than authority. Binding enforcement is a reusable workflow plus a required status check. Two
consequences follow and both are load-bearing:

- the check must be **always-emitted**: GitHub reports a path-skipped workflow as *pending*, never
  success, so a path-filtered workflow can never be bound as a required check;
- the guard runs against untrusted PR content and must therefore be **least-privileged**
  (`contents: read`) and **non-executing** — it parses the content it reads and refuses anything that
  could compute, rather than importing it. A guard that imports a consumer's module executes that
  PR's code inside CI.

### §6 Enrollment is a predicate

Enrollment is rows in the canonical registry. Exclusions are **explicit rows carrying a reason**;
absence means UNDECIDED, never exempt. No population integer appears in the registry or in any
instrument — the population is derived by org sweep at read time and never cached.

## Rejected

| Rejected | Why |
|---|---|
| npm + `postinstall` as transport | falsified by our own `--ignore-scripts` practice; yields zero skills silently |
| one directory symlink replacing per-skill links | forecloses the projection axis — a skill cannot be opted out of a directory link |
| a git hook as the enforcing seat | `--no-verify` makes it feedback, not authority |
| a hardcoded repo count | produced a wrong-by-half population that survived multiple revisions unexamined |
| receipt-local expected hash | self-attestation; a paired tree+receipt edit reports green |
| path-filtered required check | skipped runs report pending forever and can never bind |
| importing the consumer's roster to read it | executes untrusted PR code in CI |

## Consequences

`neomjs/neo` both **authors** the canonical tree and **consumes** it, so any merge touching
`.agents/skills` moves its tree past the pinned revision and turns consumer checks red until a
**promotion epoch** adopts it. That is the designed lifecycle rather than a defect — canonical
coalesces upstream change behind a tested revision and consumers re-pin — but it means a long-lived
consumer PR needs re-promotion whenever skill substrate merges, and any PR body quoting a pin goes
stale at the same moment. Automating promotion and pin-quoting is left to #17783's enforcement scope.
