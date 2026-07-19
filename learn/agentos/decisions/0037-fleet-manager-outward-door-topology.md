# ADR 0037: Fleet Manager Outward-Door Topology — One Site, Source-Less-of-Product Storefront

> The distribution boundary for Fleet Manager's public door: the product site is the one
> canonical launch URL; a product-named storefront repository owns that door's source, tracker,
> and artifact surface; all engine, Fleet Manager, and Electron-wrapper product source stays in
> `neomjs/neo`. The storefront consumes published Neo artifacts and never becomes a second product
> source tree.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-18 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005) |
| **Author** | @neo-gpt-emmy (Emmy), grounded in Discussion #15498's reconciled Option-E graduation, the #15519 criteria map, #15527's clean-consumer probe, and #15549's public-fleet capability receipt |
| **Resolves** | #15521 — the topology gate in Epic #15519 |
| **Graduated from** | Discussion #15498 — family-keyed quorum, non-author approval, and acknowledged Step-Back sweep |
| **Depends on** | ADR 0034 §2.5 — packaged-shell artifacts, signing authority, two-speed updates, and release-line cadence remain unchanged |
| **Aligns with** | ADR 0018 and `neo-identity-update` — every new outward surface inherits facts/framing/action coherence; ADR 0031 — one seam-table row per present ADR |
| **Mechanically amends** | ADR 0031's seam table and `learn/benefits/ArchitectureOverview.md` pointers; corrects ADR 0034's stale lifecycle header without changing its decision |
| **Anti-anchor for** | a second launch URL; product source copied or moved out of `neomjs/neo`; a hollow marketing-only repository; a dead/disabled download promise; storefront-authored release truth; a sample presented as live fleet data; a credential-free claim for the current canonical public-fleet reader |

---

## 1. Context

Fleet Manager has two distinct outward needs. A person evaluating the product needs a short,
human-paced door that answers why a poly-harness operator needs a cockpit. A contributor or
advisor needs the deeper engine, architecture, and live-work evidence in `neomjs/neo`. Trying to
make one URL and one repository screen serve both jobs preserves six years of category gravity;
splitting the product source to escape that gravity would create a second authority tree.

Discussion #15498 compared five topologies. The reconciled decision chose Option E: create a
product-named **storefront repository** whose own minimum-site source is an ordinary Neo app
consuming the published `neo.mjs` package, while every line of product source remains in the
monorepo. This is **source-less-of-product**, not source-less: the door has real source, tests,
templates, and release integration; it simply does not own the engine, Fleet Manager app, or
Electron wrapper.

The topology is independent of release readiness. The door can be built and tested before a
downloadable shell exists. Row 3 of #15490 gates only the download action, never the site,
storefront, recorded proof, or support-routing work. Epic #15519 is an expansion of #15490 row 4
(`Front door: landing + onboarding`), not a new roadmap row; this keeps one release denominator.

## 2. Decision

### §2.1 Source and repository ownership

The winning topology is Option E:

| Surface | Owns | Must not own |
|---|---|---|
| `neomjs/neo` | Engine, Agent OS, Fleet Manager app, Electron wrapper/packaging, canonical implementation history, release authority | Product-site copy or a second public launch URL |
| Product-named storefront repository | Minimum-site source, first-screen README, issue templates, support tracker, artifact/release presentation, site deployment configuration | Engine/FM/wrapper source, copied authority, release-line mutation |
| Product site | The one public launch story, recorded proof, onboarding path, and — only when activated — download action | A competing tracker or implementation authority |

The storefront's site consumes a **published** `neo.mjs` package through the same ordinary
consumer boundary external applications use. It never imports from a sibling checkout, copies a
monorepo subtree, patches `node_modules`, or becomes required to build the product. Conversely,
no product source moves to the storefront under this decision. A move, copy, or second canonical
launch URL is an ADR-level topology change, not an implementation convenience.

The minimum site is not gated on the full-site stack question. Its implementation may start with
the smallest published-package consumer that satisfies the launch contract. A later SSG or richer
site architecture may replace that implementation without changing this ownership boundary.

### §2.2 One canonical launch URL

The **site is the canonical launch URL**. Launch posts, documentation CTAs, artifact pages, and
the storefront README point to it. The storefront repository is the service entrance behind the
door: tracker, artifacts, templates, and site source — never a second public door.

The first screen of the storefront README points to the site and makes the monorepo relationship
an asset, not fine print: the engine, Fleet Manager, and the fleet that builds them live in
`neomjs/neo`, where the work can be inspected. #15522 owns support-routing and disposition of the
existing Fleet/engine issue blend. #15525 owns cross-surface identity coherence. Neither concern
is re-derived locally by the storefront.

### §2.3 Door-first sequencing and release authority

The door, tracker, minimum site, recorded demonstration, and notify path proceed before the
packaged shell is downloadable. Before #15490 row 3 is walked, the download action is **absent**:
not disabled, not labelled "coming soon", and not linked to a placeholder. The active primary
paths are the honest ones available at that time — watch the recorded fleet proof and request
notification.

Once the row-3 release path is proven, the surface gains exactly one working download action as
owned by #15526. The storefront consumes signed artifact metadata and release receipts; it does
not decide versions, fabricate readiness, or mutate the release line. Release authority remains
`buildScripts/release/publish.mjs`, with signing credentials and the human merge/release gates
remaining operator-owned per ADR 0034 §2.5.

### §2.4 Standing Option-A experiment — the only topology-reopening path

#15527 is the standing, **non-gating** clean-consumer experiment:

1. start from an empty directory;
2. install the exact packed `neo.mjs` artifact;
3. drive the Fleet Manager packaging/smoke path entirely through that installed dependency;
4. use no sibling checkout, `node_modules` patch, or copied authority; and
5. map the resulting installer receipt to its release commit.

The first 2026-07-18 run failed at boundary 2. Boundary 1 found that the packed artifact omits
prebuilt `dist/` CSS and a clean dependency install does not install the theme toolchain's declared
devDependencies; adding that toolchain at the consumer root cleared the experiment forward.
Boundary 2 then stopped in `buildOrganismManifest` because the staged, checkout-only Genesis probe
dynamically imported undeclared bare `playwright`.

The exact-head rerun after #15542 repaired that classification passed the full chain: from an empty
directory, the consumer installed the packed artifact, provisioned its own theme and Electron build
toolchains, staged the organism, completed `@electron/rebuild` and config initialization, and emitted
`Neo Harness-0.0.1-arm64-mac.zip` (290.6 MB) without patching the dependency or copying authority.
The current result is therefore **PASS-with-provisioning**. Boundary 1 remains packaging-maturity
work — prebuilt `dist/` CSS or a conditional theme build would remove that consumer provision — but
it is no longer a mechanical blocker to a separate consumer repository.

That pass makes Option A eligible for reconsideration; it does not silently supersede Option E.
Supersession still requires an explicit ADR amendment and an independently justified
source-divergence reason. No such reason exists in the current record, so moving product source
would add a second authority surface without a product gain. The named rerun owner is #15527's
Kimi-family seat. Re-run triggers are a `.npmignore` or pack-stage allowlist change, an ADR-0034
implementation change, an Electron major change, or a proposal to reconsider Option A. This
experiment is the only path that may reopen the repository topology under the graduated Discussion
authority.

### §2.5 Demo and data honesty

The door's proof is the deterministic recorded Fleet walkthrough and bundled sample roster owned
by the #15519 demo leaves. Sample data is always captioned as sample data and remains the zero-call
first-run authority.

#15549's live zero-token capability probe found a stronger boundary than request volume: anonymous
REST can read public issues/comments inside the 60-request core bucket, but GitHub reports GraphQL
limit 0 / read failures and rejects the collaborator trust census. The current canonical activity
reader therefore cannot preserve its complete source and trust contract without authentication.
Public fleet is an explicit **token-present opt-in**, never a credential-free default and never
implied by a recording. A reduced REST-only subset must not be silently renamed as that canonical
reader. The engine repository remains the inspectable live-work proof one click deeper.

### §2.6 Rejected alternatives and their falsifiers

| Alternative | Why rejected now | Reconsideration evidence |
|---|---|---|
| **A — separate product repo + site** | #15527 proves packaging is mechanically viable with consumer-side build provisioning, but no source-divergence need exists; moving product source would fork authority and begin with zero social proof | An independently reviewed source-divergence reason survives; #15527 already satisfies mechanical eligibility |
| **B — site only, all tracking in `neomjs/neo`** | The support layer retains the measured blend of 91 open FM/cockpit-titled issues instead of giving the product a routed entrance | Evidence that the storefront tracker adds only routing cost and does not partition product support |
| **C — separate org and unbound product identity** | Severs both the engine-credit flywheel and the org-adjacent public-fleet provenance path, while doubling governance/coherence surfaces | Evidence that org adjacency itself prevents adoption strongly enough to outweigh provenance and proof loss |
| **D — defer topology until usage signal** | The public launch is itself the topology moment; deferral spends the launch twice and blocks feedback from the absent door | Evidence that an early door measurably harms rather than improves launch learning |

## 3. Consequences and consumer obligations

- #15520 may settle the product name without relocating source; the operator owns the final name.
- #15522 implements support routing against one storefront tracker and preserves engine escalation.
- #15523–#15526 may build and launch the minimum door without waiting for row 3, except that #15526
  cannot render a download action until the artifact path works.
- #15525 and `neo-identity-update` govern every new outward surface. Facts derive from authority;
  framing is surface-specific; calls to action obey §2.2–§2.3.
- #15524 keeps the bundled sample as the zero-call first-run authority and offers public fleet only
  through an explicit token-present opt-in that preserves the canonical reader's full contract.
- #15527 remains a diagnostic experiment beside release work, not a dependency edge that can halt
  the storefront or site.
- The storefront release integration consumes monorepo receipts. It never becomes a second
  release authority or an alternate path around ADR 0034.

## 4. Avoided traps

1. **Two canonical URLs:** a repo README and site competing for launch traffic and truth.
2. **Marketing husk:** an empty repository whose Code tab inverts credibility. The door owns its
   real site source, tests, templates, and deployment configuration.
3. **Source creep:** moving or copying FM/wrapper code to make the storefront look substantial.
4. **Dead-button theatre:** spending the launch moment on a download promise that cannot execute.
5. **Copied identity facts:** hand-maintained version, capability, or category claims drifting
   from the monorepo's authorities.
6. **Tracker duplication without routing:** creating a second issue queue without an explicit
   product-vs-engine disposition and escalation path.
7. **Demo/product ambiguity:** presenting canned roster data or a recording as a live fleet.

## 5. Verification and liveness

- **Authority:** Discussion #15498's reconciled body and graduation receipts; Epic #15519's
  criteria mapping and final structured review.
- **Existing owner:** ADR 0034 §2.5 continues to own installers, signing, update cadence, and
  release-line cadence; PR #14924 merged that record on 2026-07-10.
- **Mechanical inventory:** ADR 0031 and `lint-adr-seam-table.mjs` require exactly one 0037 row.
- **Executable falsifiers:** #15527 records the clean-consumer boundary and owns packaging reruns;
  #15549 records the public-fleet capability boundary and must be rerun if provider access policy
  or the canonical reader's acquisition plan changes.
- **Revalidation trigger:** re-poll Discussion #15498 if delivery slips materially past the
  graduated estimate, if the flatrate/seat landscape materially changes operating capacity, or if
  #15490 row 3 remains unwalked on 2026-08-15. Re-polling does not itself mutate topology.

A future leaf contradicting §2.1–§2.4 amends or supersedes this ADR first. Site implementation,
copy, and visual treatment may evolve freely inside these boundaries.

## Decision Record impact

Extends ADR 0034 §2.5 at the outward-door boundary and aligns with ADR 0018. It does not amend
Electron shell behavior, packaging ownership, signing, update cadence, or release authority.

Related: Discussion #15498 · Epic #15519 · #15521 · #15522–#15527 · #15542 · #15549 · #15490 ·
ADR 0018 · ADR 0031 · ADR 0034

Origin Session ID: ad71d4c3-3e37-4a17-8df7-8415509def84
