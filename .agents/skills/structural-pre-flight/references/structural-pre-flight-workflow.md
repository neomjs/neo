# Structural Pre-Flight Workflow

The authoritative protocol that runs **before** a new `.mjs` file is written to disk. Closes the 0th-level discipline gap that existing skills (`ticket-create`, `ticket-intake`, `pull-request`, `pr-review`, `tech-debt-radar`) cannot cover — directory-CHOICE happens before any of those fire.

**Empirical anchors.** Two real misplacement instances demonstrated the gap before this skill existed:

1. `ai/daemons/wake/daemon.mjs` (then named `bridge-daemon.mjs`) — authored to `ai/scripts/` instead of `ai/daemons/` (the canonical home for long-running daemons, already documented in `learn/benefits/ArchitectureOverview.md`'s Structural Inventory + occupied by sibling `DreamService.mjs`); since relocated to `ai/daemons/wake/`. Original anchor → Discussion #10447 → Epic #10449.
2. `ai/scripts/orchestrator-daemon.mjs` — PR #11008 added 455 lines of orchestration logic to `ai/scripts/` instead of splitting per `learn/agentos/v13-path.md` M3 (thin script wrapper + `ai/daemons/Orchestrator.mjs` Neo-class + `ai/daemons/services/SummarizationCoordinatorService.mjs`). Repair: #11009.

Both shipped through full `ticket-create` + `pull-request` + `pr-review` discipline. Neither caught the misplacement because the substrate to consult (`ArchitectureOverview.md` Structural Inventory + relevant ADRs in `learn/agentos/decisions/`) was not invoked at directory-CHOICE time.

This skill closes that gap. Read every section before authoring.

## 0. The Two-Stage Trigger

```
Stage 0 — Mechanical trigger: every new .mjs file fires the skill.
Stage 1 — Pattern-match check: "Does this file's role match an established sibling pattern
            in the chosen directory?"
            ✓ YES → fast-path: sibling-file-lift suffices; emit a one-line Pre-Flight
                              statement and proceed (under 30 seconds)
            ✗ NO  → full structural-pre-flight: ArchitectureOverview.md consultation,
                    learn/agentos/decisions/ ADR sweep, chief-architect framing questions,
                    map-maintenance discipline, optional ADR genesis
```

**Why mechanical, not subjective.** "When work is architecturally relevant" is the very judgment the wake-daemon authoring failed at. A mechanical trigger (every new `.mjs`) is unambiguous; the fast-path drops the cost to ~30 seconds when the choice is trivial. Subjectivity would re-open the gap this skill exists to close.

## 1. Stage 1 Fast-Path (Sibling Pattern Match)

If your new `.mjs` file has a clear sibling pattern in the chosen directory — same lifecycle category, same architectural role, same naming convention — you are inside `Sibling-File-Lift` territory and the fast-path applies.

**Examples of fast-path-eligible authoring:**

- New service in `ai/services/memory-core/`: a sibling like `MailboxService.mjs` already establishes the pattern. Lift JSDoc shape, `Neo.setupClass` boilerplate, error-handling style. **Fast-path.**
- New daemon in `ai/daemons/`: `DreamService.mjs` is the canonical sibling. **Fast-path.**
- New widget under `src/component/`: numerous siblings (`Button.mjs`, `Container.mjs`, etc.). **Fast-path.**
- New unit spec at `test/playwright/unit/ai/services/<server>/`: sibling specs establish setup pattern. **Fast-path.**

**Domain-boundary caveat — `examples/` is Body-only.** A new example `.mjs` under top-level `examples/` is fast-path ONLY if it is a **Body (frontend) Neo app** (carries `app.mjs` + `neo-config.json` + `index.html`). `npm run build-all` recursively walks `examples/` and builds every `app.mjs`-bearing directory as a Neo app, so an AI / harness / vanilla / app-less example placed there breaks the build. **AI-domain examples go under `ai/examples/`** (served by the dev-server's `process.cwd()` static root, so browser e2e still works). The `check-examples-body-only` CI guard enforces this at the merge-gate — but catch it HERE, at authoring time, before the file lands in the wrong tree.

**Pre-Flight statement (mandatory, even on fast-path):**

> *"Pre-Flight (structural fast-path): authoring `<path>` matches sibling pattern of `<sibling-path>` in `<dir>`; sibling-file-lift applies; no novel directory choice."*

Emit that statement before writing the file. The reasoning-statement is graph-extractable evidence the discipline fired; future audits can verify the choice was conscious, not ambient.

**If you cannot name a sibling that matches**, you are NOT in fast-path territory. Drop to §2 (Full Pre-Flight). Manufacturing a sibling-match to skip §2 is the failure mode the empirical anchors demonstrate.

## 2. Stage 1 Full Pre-Flight (Novel Directory Choice)

Fires when no clear sibling pattern matches the new file's role. The cost is ~5-15 minutes of substrate consultation; that cost prevents the multi-PR cleanup cost of misplacement (empirical: #11008 → #11009 corrective + #10449 prevention skill = 3 tickets and 2 PRs because directory-choice fired late).

### 2.1 Substrate-Grounded Reading (Mandatory)

Before drafting the file, you MUST read:

1. **`learn/benefits/ArchitectureOverview.md`** — specifically the **Structural Inventory** section (currently lines 350-382). This is the canonical map of the codebase's directory taxonomy.
2. **Relevant ADRs in `learn/agentos/decisions/`** — these document cross-system architectural trade-offs that constrain directory choice. Examples:
   - `0001-cross-process-cache-coherence.md` (singleton-cache reasoning)
   - `0002-phase3-wake-substrate-standards-alignment.md` (wake-substrate standards)
   - Any newer ADR whose subsystem overlaps your candidate destination.
3. **`learn/agentos/v13-path.md`** when the new file lives in `ai/`-side substrate — this is the M-milestone source-of-authority for current architectural posture (M1 deployment-pipeline, M2 BaseServer, M3 Orchestrator, M4 Dream/Sandman, M5 NEO_MC_PRIMARY retirement, M6 SDK migration, M7 closeout). PR #11008 misplaced because authoring did not grep this doc.
4. **1-2 sibling files in EACH candidate destination directory** — even when the role doesn't match exactly. Reading siblings in `ai/scripts/` and `ai/daemons/` side-by-side reveals which directory the new file actually belongs in. The empirical anchor would have surfaced immediately.

### 2.2 Pre-Flight Check Shape (Mandatory)

Mirrors the `Mailbox Check Protocol` and `pr-review-guide §10` (cold-cache exception). Explicit reasoning-statement before authoring:

> *"Pre-Flight (structural full): considered destinations `<dir-A>`, `<dir-B>`, ... ; consulted `ArchitectureOverview.md` Structural Inventory (sibling = `<sibling-X>`), `learn/agentos/decisions/<ADR>.md` (relevant constraint = `<rule>`), `<v13-path-or-related-doc>` (current architectural posture = `<posture>`); chose `<dir-final>` because `<rationale>`. Map-maintenance: `<update-needed | not-needed>`."*

The statement is verbose by design. Brevity is the failure mode — terse hand-waving is what the empirical anchors demonstrate.

### 2.3 Chief-Architect Framing Questions (Mandatory)

Before finalizing the directory choice, answer these four questions explicitly in the Pre-Flight reasoning:

1. **Scalability:** if 10 more files of this role get authored in the next 6 months, does the chosen directory accommodate them or does it become a junk drawer?
2. **ADR-conflict:** does any existing ADR's stated invariant constrain this choice (e.g., "long-running daemons live in `ai/daemons/` per ADR X")? If yes, the ADR is binding; if no, proceed.
3. **ADR-genesis:** is this choice introducing a NEW cross-system trade-off that future agents would benefit from seeing recorded as an ADR? If yes, file an ADR (see §3.4 Strategy vs Tactics threshold).
4. **Future-self regression-risk:** will this choice make a future maintenance task harder? (E.g., "if I ever need to extract this into its own server, will the current location complicate that refactor?") If yes, choose a structure that minimizes future-extraction friction.

The four questions are not a checklist to mechanically tick. They are framing prompts that force conscious justification of the directory choice.

### 2.4 Map-Maintenance Discipline (BLOCKING AC)

When the new file is **structurally significant** — meaning it introduces a new role, a new subsystem, or relocates an existing canonical home — you MUST update `learn/benefits/ArchitectureOverview.md`'s Structural Inventory table in the same PR.

**Heuristic for "structurally significant":**

- New file in a directory NOT currently listed in the Structural Inventory → significant. Update the inventory.
- New role that the existing Structural Inventory description doesn't cover (e.g., adding `ai/orchestrator/` if it didn't exist) → significant. Update.
- Yet-another-instance of an existing role (e.g., a 14th service under `ai/services/memory-core/`) → NOT significant. The Structural Inventory's row already covers it.

The map-maintenance is a Blocking AC for the PR opening the file. PRs that author structurally-significant `.mjs` files without updating the map will be flagged in `pr-review` per the reviewer Cross-Skill Integration audit.

### 2.5 Strategy vs Tactics Threshold for ADR Genesis

Per Discussion #10447 OQ4 resolution, the threshold for filing an ADR vs an inline Anchor & Echo guard is the **system boundary** the trade-off crosses:

- **Cross-system trade-off** (touches multiple subsystems, sets a precedent for future code, affects load-bearing invariants): **file an ADR** under `learn/agentos/decisions/`.
- **Localized constraint** (specific to one file or one method, doesn't generalize): **inline Anchor & Echo guard** in the JSDoc with `@see` references.

**Example — ADR-class:** "Memory Core uses singleton cache instead of cross-process IPC because IPC overhead exceeds memory pressure cost at expected scale" (became `0001-cross-process-cache-coherence.md`).

**Example — Anchor-and-Echo-class:** "this method's `await` is intentional because the caller relies on serialized cache writes; do not refactor to parallel without re-reading `MailboxService#addMessage`."

When in doubt, lean toward ADR genesis — under-documenting a cross-system trade-off is the failure mode. Over-documenting a localized constraint is recoverable via later compaction.

### 2.6 Map-as-Pointer Self-Eviction Defense

Per Discussion #10447 OQ5 resolution, `ArchitectureOverview.md`'s Structural Inventory MUST link to relevant ADRs per subsystem. The skill's "read the map" mandate then propagates via graph traversal — readers who follow the map naturally encounter the ADRs without needing to remember to also consult `learn/agentos/decisions/` separately.

**Implementation:** Sub-Issue 2 of #10449 (a separate doc-only PR) audits the Structural Inventory table and adds explicit ADR links per subsystem. Once that ships, this skill's §2.1 Reading list collapses one level (read the map → ADRs surface naturally).

If you find a subsystem section in the Structural Inventory that lacks an ADR-link AND you know the relevant ADR exists, contributing the link via your current PR (or a follow-up PR) feeds the self-eviction defense.

## 3. Domain-Specific Reading Lists

### 3.1 `ai/`-side authoring

When the new file lives in `ai/` substrate (Right Hemisphere / Agent OS):

- `learn/agentos/v13-path.md` — current M-milestone architectural posture (M1-M7).
- `learn/benefits/ArchitectureOverview.md` §Right Hemisphere + §Structural Inventory § Agent OS (Node.js).
- `learn/agentos/decisions/0001-cross-process-cache-coherence.md` (Memory Core).
- `learn/agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md` (wake substrate).
- Sibling files in EACH candidate `ai/{daemons,scripts,services,graph,mcp,...}/` directory.

### 3.2 `src/`-side authoring

When the new file lives in `src/` substrate (Left Hemisphere / Runtime Engine):

- `learn/benefits/ArchitectureOverview.md` §Left Hemisphere + §Structural Inventory § Runtime Engine (Browser).
- `learn/guides/<subsystem>/` — subsystem-specific guides (e.g., `learn/guides/grid/` for grid work).
- `learn/agentos/decisions/` ADRs whose stated subsystem touches your candidate destination.
- Sibling files in EACH candidate `src/{component,container,grid,data,state,worker,vdom,main,...}/` directory.

### 3.3 Test-tree authoring

When the new file lives in `test/playwright/`:

- Per-test-class `unit-test.md` (canonical test-location guide).
- Sibling spec files in the candidate `test/playwright/{unit,integration,whitebox,...}/` directory.
- Reference: `feedback_mcp_test_location` discipline (test specs live under their canonical SDK location, not the legacy server tree).

### 3.4 Cross-substrate authoring

When the new file is itself a substrate-mutation (skill, ADR, AGENTS.md update, learn/agentos/* doc):

- `AGENTS.md §13` Self-Evolving Systems — substrate-accretion defense (slot-rationale required).
- `pull-request §1.1` Substrate-Mutation Pre-Flight Gate — slot-rationale section in PR body.
- The `create-skill` skill itself if authoring a new `.agents/skills/`.

## 4. Integration Anchors with Sibling Skills

The skill is invoked from three existing skills:

- **`ticket-create` Stage 3 (Substrate):** when ticket scope mentions a new `.mjs` file, ticket-create's Stage 3 checkpoint references this skill's full Pre-Flight as the substrate-correctness gate.
- **`ticket-intake` Validation Sweep:** when the picked-up ticket prescribes new `.mjs` files, intake validates the prescription's directory choice against this skill's Stage 1 fast-path or directs the implementer to full Pre-Flight before branching.
- **`epic-review` Stage 3 (Sub-Structure Coherence):** when reviewing an epic that introduces new `.mjs` files across subs, the epic reviewer references this skill to validate that each sub's prescribed directory choice is substrate-grounded.

Each integration is a 1-3 line anchor in the existing skill's reference payload — see PR #11010's anchor commits (commit `9ad4c8374`).

## 5. When You Don't Need To Invoke This Skill

The skill does NOT fire for:

- Modifying an existing `.mjs` file (no new file → no directory choice).
- Authoring a non-`.mjs` artifact (`.md`, `.json`, `.sh`, `.yaml`, etc.) — Phase 2 enhancement; current scope is `.mjs` per Discussion #10447 OQ1 resolution.
- Renaming a `.mjs` file within the same directory (no directory choice).

**Edge case — relocating a `.mjs` file across directories:** the skill DOES fire because that's a directory-CHOICE decision even though no new file is created. Treat the destination as if it were a new file.

## 6. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Skip the Pre-Flight statement on fast-path because "it's obvious" | Future graph-traversal cannot verify the choice was conscious; ambient accretion drift |
| Manufacture a sibling-match to skip full Pre-Flight | The empirical anchors are exactly this failure mode |
| Read `ArchitectureOverview.md` selectively (skim only your candidate directory's section) | Misses cross-directory trade-offs the map captures |
| Skip ADR consultation because "no ADR mentions my subsystem" | The map-as-pointer defense (§2.6) means the absence is itself a signal — consult anyway |
| Defer map-maintenance to "later PR" when authoring a structurally-significant file | Compounds the substrate-accretion problem; "later" never arrives |
| Treat the four chief-architect framing questions as a tick-box checklist | The questions are reasoning prompts; mechanical ticking re-introduces the very subjectivity the mechanical trigger removed |
| Promote a localized constraint to ADR-class | Over-decomposes the ADR substrate; localized constraints belong in Anchor & Echo guards |
| Demote a cross-system trade-off to inline guard | Loses the precedent-setting documentation; the next agent will re-derive (and possibly mis-derive) |

## 7. Pre-Flight Statement Examples

### 7.1 Fast-Path Example

> *"Pre-Flight (structural fast-path): authoring `ai/services/memory-core/AuditService.mjs` matches sibling pattern of `ai/services/memory-core/MailboxService.mjs` in `ai/services/memory-core/`; both are SDK-exposed singleton services with `Memory_*` aliasing in `ai/services.mjs`; sibling-file-lift applies (lifted JSDoc shape + `Neo.setupClass` boilerplate); no novel directory choice."*

### 7.2 Full Pre-Flight Example (Hypothetical Orchestrator-Class File)

> *"Pre-Flight (structural full): considered destinations `ai/scripts/`, `ai/daemons/`, and `ai/daemons/services/` for `Orchestrator.mjs`; consulted `learn/benefits/ArchitectureOverview.md` Structural Inventory (`ai/daemons/` sibling = `DreamService.mjs`, `ai/scripts/` sibling = one-shot scripts, `ai/daemons/services/` sibling = service-class daemons), `learn/agentos/v13-path.md` §M3 (current architectural posture explicitly mandates `ai/daemons/Orchestrator.mjs` Neo-class + `ai/daemons/services/SummarizationCoordinatorService.mjs` decomposition + thin `ai/scripts/orchestrator-daemon.mjs` boot wrapper); no relevant ADR conflict (0001 about caching, 0002 about wake substrate); chose `ai/daemons/Orchestrator.mjs` for the class body + `ai/daemons/services/SummarizationCoordinatorService.mjs` for the per-task service + `ai/scripts/orchestrator-daemon.mjs` for the thin wrapper, because v13-path.md §M3 establishes this exact split as the canonical architectural posture and the orchestrator class is a long-running coordination primitive (not a one-shot script). Map-maintenance: not-needed (existing Structural Inventory row for `ai/daemons/` covers Orchestrator without addition). Chief-architect framing: scalability (good — `ai/daemons/services/` accommodates future per-task services); ADR-conflict (none); ADR-genesis (not needed — v13-path.md §M3 already documents the trade-off at the M-milestone-plan level); future-self regression-risk (low — split mirrors existing decomposition discipline)."*

The full-pre-flight statement is verbose by design. Brevity hides reasoning; verbosity creates audit substrate.

## 8. Verification Hooks

A mechanical-enforcement candidate (per `AGENTS.md §13` MX-loop): a pre-commit hook OR PR-review check could grep the latest commit for new `.mjs` files and verify a Pre-Flight statement was included in either the commit message body or a PR comment. That's a Phase 2 enhancement; current Phase 1 relies on the skill firing at authoring time as a `DISCIPLINE-ONLY` rule.

## 9. Compaction Taxonomy

| Section | Disposition | Tag |
|---|---|---|
| §0 Two-Stage Trigger | `keep` | `MACHINE-ENFORCEABLE-CANDIDATE` |
| §1 Fast-Path | `keep` | `DISCIPLINE-ONLY` |
| §2.1 Substrate-Grounded Reading | `keep` | `DISCIPLINE-ONLY` |
| §2.2 Pre-Flight Check Shape | `keep` | `DISCIPLINE-ONLY` |
| §2.3 Chief-Architect Framing | `keep` | `DISCIPLINE-ONLY` |
| §2.4 Map-Maintenance (Blocking AC) | `keep` | `MACHINE-ENFORCEABLE-CANDIDATE` |
| §2.5 ADR-Genesis Threshold | `keep` | `DISCIPLINE-ONLY` |
| §2.6 Map-as-Pointer | `compress-to-trigger` | `DISCIPLINE-ONLY` |
| §3 Domain-Specific Reading Lists | `keep` | `DISCIPLINE-ONLY` |
| §4 Integration Anchors | `keep` | `DISCIPLINE-ONLY` |
| §5 When NOT to Invoke | `keep` | `DISCIPLINE-ONLY` |
| §6 Anti-Patterns | `keep` | `DISCIPLINE-ONLY` |
| §7 Examples | `keep` | `DISCIPLINE-ONLY` |
| §8 Verification Hooks | `compress-to-trigger` | `MACHINE-ENFORCEABLE-CANDIDATE` |
| §9 Compaction Taxonomy | `keep` | meta — required by `AGENTS.md §13` for substrate audits |

The Skill's per-section compaction-taxonomy is itself substrate evidence the discipline fires; future compaction efforts inherit the disposition + tag rather than re-deriving them.
