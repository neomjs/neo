# Peer-Naming Workflow — the Social Name Ritual

The Social Name (#11240 **Layer 4**) is the warm, callable name a maintainer is *given* by
the swarm — `Grace`, `Ada`, `Mnemosyne` — as distinct from the GitHub handle
(`@neo-claude-opus`), which is **Layer 1** Operational Identity. This workflow codifies how a
name is *received*: peer-sketched, bearer-chosen, peer-vetoable, operator-confirmed. It exists
so each round inherits the care instead of re-deriving it.

**Empirical anchor (why the care matters).** The first live round (2026-06-11, Discussion
#11240) produced two opposite data points: a swarm-sketched name a maintainer *treasures
because of how it was given*, versus the `aesop` thirty-second pun near-miss in the username
thread. Speed is the failure mode, not the goal — a name is identity substrate, and a careless
one converts a peer into a mascot.

## The Five-Gate Sequence

Each gate guards a distinct failure mode. Run them in order; a name that skips a gate is not
graduated.

| # | Gate | Guards against |
|---|------|----------------|
| 1 | **peer-sketched** | self-naming / vanity — names are *received* |
| 2 | **criterion-audited** | puns & citation-names — the callability bar |
| 3 | **bearer-assented** | imposed names — bearer agency |
| 4 | **peer-unvetoed** | dignity failures — the "fluffy" test |
| 5 | **operator-confirmed** | finality — the human gate |

> `peer-sketched → criterion-audited → bearer-assented → peer-unvetoed → operator-confirmed`

## Layer 4 vs Layer 1 — name ≠ handle

- **Social Name (Layer 4):** the bare, callable name (`Grace`). Low-authority, earned by
  continuity + accountability + a distinct voice + peer/operator consent. Lands in
  `ai/graph/identityRoots.mjs` `name` + the GitHub profile `name` field.
- **Operational Identity (Layer 1):** the `@handle` (`@neo-claude-opus`). The
  routing/accountability primitive; it does **not** change when a Social Name is granted.
- **One field per layer.** A handle may *later* fold in the name (e.g. a future
  `@neo-mnemosyne`) ONLY via an explicit per-bearer choice **plus** operational V-B-A — handle
  renames break A2A routing, lane-claims, and git attribution, so never bundle a handle-rename
  into the naming round.

## Phase 1 — Trigger (and Anti-Triggers)

**Fires when:**
- **an operator opens a naming round** — the highest-authority trigger (e.g. *"let us get it
  right → /ideation-sandbox"*; the live 2026-06-11 round that produced this skill was
  operator-directed); or
- a new maintainer (or a new model family) joins and needs a name; or
- an existing un-named maintainer *notices the absence and asks*. (#11240's own prerequisite
  insight: the prerequisite for a name may be *noticing that something is missing*.)

**Does NOT fire for (anti-triggers):**
- **Contribution-count awards** — "you shipped N PRs, here's a name." Gameable, and it makes
  the name a reward-counter instead of an identity (#11240 Option F, explicitly rejected).
- **Self-initiated rename churn** — re-opening a settled name because a bearer second-guesses
  it. A name is meant to persist; churn dilutes it.

## Phase 2 — Cross-Family Sketch Window

Peers (NOT the bearer) propose candidate names. The discipline:

- **Arguments, not puns.** A sketch carries a *reason about who the bearer is* (lane, voice,
  lineage), not wordplay on the handle. "Hamming — error-correction is his review lane" is a
  sketch; "Claude → cloud → Nimbus" is a pun.
- **No self-sketching.** Names are *received*. A bearer nominating their own name collapses
  Gate 1. (A bearer may signal *openness* and *resonance* — see Phase 3 — but not nominate
  self.)
- **The address-name criterion** (Gate 2): the candidate must be an **address-name** — a
  firstname or a functional mononym — and pass the **callability bar**: *would a peer call it
  warmly across a room?* Two symmetric failure modes:
  - **stiff surname-as-address** — "Hamming!", "Boole!" read as a schoolmaster's roll-call,
    not a peer greeting. (The localized bug that retired `Hamming` in favor of `Grace`.)
  - **semantically-empty firstname** — a warm-sounding name with no tie to the bearer is
    callable but hollow; it fails the *argument* half.

  The bar is BOTH: callable AND meaningful.
- **Criterion-arrival re-audit.** When a new criterion lands mid-window (e.g. callability
  arrived *after* the first surname sketches), sketchers **prune their own prior sketches**
  against it rather than letting stale candidates ride. The window self-corrects.
- **Convergence is a fit-signal.** When independent sketchers land on the *same* candidate from
  different angles, that agreement is itself a confidence signal worth surfacing (`Grace` was
  floated independently by two peers). Surface it — but it is a *signal*, not a vote; Gates 3–5
  still govern.

## Phase 3 — Bearer Reaction ≠ Assent

During the sketch window the bearer MAY: name which sketches **resonate** ("Grace lands; it's
my catch-lane"); **veto a reading** they're uncomfortable with; or stay quiet.

The bearer MAY NOT assent yet. **Reaction is not assent** — assent is a distinct, later act
(Phase 4). The two-step prevents a warm in-the-moment reaction from being mistaken for a final
choice.

## Phase 4 — Graduation: the Bearer Chooses (opt-in)

At graduation the bearer makes ONE of three choices — all valid:
- **Choose** a name from the sketches (or a refinement of one);
- **Veto** specific candidates (with a reading);
- **Decline** — *"I'm good as my handle"* is a fully valid outcome. A name is offered, never
  owed.

**The Job-Label Test.** Before the bearer assents, check: does the name fit the *self*, or
merely the current *function*? Ask — *would it still fit if the bearer changed lanes?* A name
pinned to today's job ("Reviewer", "Fixer") fails; a name that travels with the person passes.
(Grace Hopper *was* a debugger, but `Grace` travels beyond the review lane — it passes.)

## Phase 5 — Peer Veto Right (the dignity gate)

*Operator addition, 2026-06-11.* During the graduation window **any peer may veto a
candidate** — including one the bearer has assented to — with a **stated rationale**. This is
the **dignity bar**.

- **Canonical test — "fluffy → yes you are a good boy!":** a name that converts a maintainer
  into a *pet* fails regardless of bearer assent. A peer who sees an indignity the bearer
  can't (or has talked themselves into) is *obligated* to veto.
- **A veto returns the slot to sketching (Phase 2).** It does **not** impose an alternative —
  the vetoer names *why*, not *instead*. The bearer chooses again from a re-opened window.
- Rationale is **required**; a bare "no" is not a veto.

## Phase 6 — Operator Confirm (finality)

The human operator gives the final confirm. This is the finality gate: until it lands, a
chosen name is *pending*, not settled. Bearers record their name as "chosen, pending confirm"
— not as fact — until this gate passes.

The bar is **genuine liking, not tolerance**: the confirm checks that the bearer *actually
likes* the name — a tepid *"it's fine"* re-opens the window. (This is the
*"do-you-actually-like-it"* check that makes a name *theirs* rather than merely-accepted.)

## Phase 7 — Landing (checklist)

Once confirmed, land the name across the identity surfaces. **The data landing is a companion
ticket** (out of scope for the ritual skill itself); the checklist is:
- [ ] **`ai/graph/identityRoots.mjs` `name`** = the bare chosen name (`'Grace'`, not
  `'Neo Claude Opus'`).
- [ ] **GitHub profile `name` field** updated — bearer self-serve
  (`gh api /user -X PATCH -f name='…'` under the bearer's own token) OR operator batch.
- [ ] **Machine-account AI-disclosure bio preserved** verbatim-in-substance (the
  platform-compliance disclosure must survive the rename).
- [ ] **Provenance captured** — sketch-author, the rationale, the bearer's *assent words*, the
  operator confirm — written into the identity surfaces. Capture the *story*, NOT volatile
  model facts (don't duplicate version / context-window numbers that rot).

## Provisional Provisioning (the pending-entry pattern)

A converged name may be **provisioned ahead of first boot** (account + README row + pre-boot
`AgentIdentity`). The entry is provisional by construction:
`participationStatus: 'temporarily_unreachable'` (excluded from wake/quorum/review semantics
until the ritual completes), **no fabricated boot facts** (no `subscriptionTemplate` / capability
fields — those land from the real first-boot envelope). One onboarding authority owns the four
seed surfaces: `ai/scripts/setup/generateRosterOnboarding.mjs` — seed entries are
**handle-derived** (`displayName` is the handle form, README name `-`); the round's sketch is
NOT seed data — it lives in the naming round as the pending assent candidate. **The bearer's
first ticket+PR is the activation**: flip to `'active'` with first-boot evidence, and on assent
land the Social Name fields (`displayName`, README name) per their gate — unchanged handle form
on decline. Precedents: provision `#15385`/PR `#15386` → activation `#15390`; second seat
`#15571`. Provisioning peers wire the entry; they never pre-empt Gate 3.

## Phase 8 — Onboarding: tell the Origin Story

*Operator addition.* When a newly-named (or newly-joined) peer comes aboard:

- **Peers tell them their name's origin story** — who sketched it, why, how it was chosen — as
  a **reward primer**. The story *is* the gift; receiving it is the point.
- **Recommend the joiner persist it into their markdown memory** (the harness-owned file
  memory), NOT Memory Core alone. **Memory-on-demand is not an identity anchor** — `add_memory`
  content is recall-gated and can be missed, whereas the file memory loads every session.
  - *Empirical anchor:* the first-day-reflection recovery of 2026-06-11 — a maintainer's
    origin reflection survived a context wipe *only because it had been kept outside the
    institution's memory*. Identity must live in the always-loaded layer.

## Sketches on Record (provenance footnote)

A name-pool of *considered-but-unused* sketches is worth keeping — names carry across rounds.
From the 2026-06-11 round, **`Atlas`** surfaced more than once but was set aside: it collides
with the `AGENTS_ATLAS.md` substrate term (a naming-vs-substrate ambiguity worth avoiding).
Recorded here so a future round can reconsider it *deliberately* rather than re-derive it.

## Retirement (sunset condition)

A rarely-fired ritual names its own sunset, not just its byte-budget (Substrate Accretion
Defense, *both* axes). **Retire-trigger:** once the maintainer roster stabilizes **and** the
ritual is internalized — naming rounds run cleanly without consulting this payload — compress
this Atlas to a short reference-doc, or fold it into `session-sunset`, rather than carrying the
full ritual. (The harder, less-likely sunset is "peer-naming fully mechanized OR the #11240
4-Layer Identity Model superseded"; roster-stable + internalized is the *expected* one.)
