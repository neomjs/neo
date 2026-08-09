# ADR 0038: The FM client topology — the cockpit connects; the plane owns fleet truth

> The Frontier-Model cockpit (FM) is a **pure client** of the Agent OS plane: it renders plane-owned state and sends typed requests over an authenticated wire — it **never runs organism children**, never imports runtime trust primitives from a checkout, and never reconstructs fleet truth from local files or intercepted traffic. The fleet surface lives **in the composition** as an optional-per-profile service. Identity, visibility, and content access are **four non-aliased facts** guarded by **two never-aggregated grant families** with an at-rest coherence invariant. This ADR is the durable client-topology anchor the D#16720 subs cite; the Discussion is archaeology after merge.

| Attribute | Value |
|---|---|
| **Status** | Draft (proposed at Discussion #16720 graduation; Accepted on human merge of the implementing PR) |
| **Amended** | 2026-08-09 (#16740, the S6 leaf): §2.5.1 lands the canonical credential-class ledger — six classes × nine columns, the tunnel-delegated transport disposition, and the provider-secret boundary — completing §2.5's forward reference. Additive; no §2.2–§2.8 contract changed. |
| **Author** | @neo-fable-clio (Clio, Claude Fable 5) drafting; architecture converged operator + four families via D#16720 (12 body versions, one evening, 2026-08-08) |
| **Graduated from** | Discussion #16720 — *"FM as pure client: the fleet surface joins the composition (optional container) + PAT-grade auth for cross-hardware planes"* (family-keyed quorum: fable `AUTHOR_SIGNAL`+`APPROVED` · Opus `APPROVED` (re-stamped, blockers verified closed) · GPT `[GRADUATION_APPROVED]` at the filed state). #16720 is **archaeology** — never required reading |
| **Resolves** | #16747 (the D1 Decision-Record carrier; parent Epic #16168) |
| **Amends** | ADR 0020 §3 + §4 (the in-process-main sentence itself rewritten + restart affordances re-scoped for the pure client), ADR 0026 §2.7 (the reserved `restartAgent` fold — executed), and ADR 0034 §2.1 + §2.6.4 (the accepted shell-specific hosting frame + dev/prod dichotomy, re-scoped as plane bootstrap beneath the client wire). All amendment notes land in the **same PR** as this file, per the #13880 no-dangling-cross-reference precedent — at the statements a future session will retrieve, not only at the concept anchor |
| **Depends on** | [D#16176](https://github.com/orgs/neomjs/discussions/16176) (graduated control-plane parent — `ownerPrincipal`, the grant families, registered projections, the Fleet service selection; **this ADR is the client-side delta, never a second control-plane authority**), ADR 0019 §10.8 (credential-class taxonomy the S6 ledger must stay consistent with), ADR 0014 (service-boundary rationale for the Fleet service seat) |
| **Informs** | S1–S7 (#16735–#16741, control-plane leaves under #16168) · C1 #16742, C2 #16743 (client connection/bridge under #13015) · C3 #16744, C4 #16745 (cockpit UI/UX under #14560) · C5 #16746 (harness demotion under #13377) · the v13.2 "FM with data" milestone gate |
| **Anti-anchor for** | the cockpit-as-supervisor regression (FM spawning/attaching organism children as its identity); login-keyed ownership (a rename or forge-namespace collision silently reassigning fleet state); grant aggregation (roster visibility widening content visibility, or one granularity enum for both); interception-reconstructed fleet views (a host-side "local alternative reality" that sees only its own traffic slice); trust-policy twins in the client SDK (client-side re-implementation of server authorization) |

---

## 1. Context

The 2026-08 hard cut moved the organism's data into containers (MC + KB canonical HTTP, #16675 lineage). Two same-day findings falsified the shell's inherited assumptions (root-cause receipt on #16699): the shell-spawned fleet transport answered `{rows: []}` because it read a host `.neo-ai-data/fleet/registry.json` that no longer exists, and `harness/brain.mjs` (`loadFleetRuntimeContracts`) dynamically imported **trust primitives** from the host checkout's `ai/` tree — assuming *tree = organism*, which the hard cut falsified for every non-packaged topology.

The operator's architectural direction, adopted on its merits: the Agent OS plane can live on **different hardware** (cloud); FM is **not in charge of running** the orchestrator — **FM connects**. Two structural falsifiers close the alternatives: a cockpit reading a stale local graph can never show a live peer, and host-side interception of plane traffic to reconstruct fleet views builds a **split-brain local alternative reality** that is incomplete by construction (it sees only the traffic slice transiting that one host — seat-level production confirmation in D#16720).

Authority lineage: D#16176 / #16168 own the control-plane selections (Fleet service in the composition, service-owned data root, server-derived request identity, registered projections). This ADR records the **client-side delta** and the cross-cutting identity/visibility contracts the implementing subs share.

## 2. Decision

### 2.1 The topology — FM connects (three roles, two registries)

**FM never runs organism children.** The cockpit is a client: it renders state and sends typed requests. Any "boot a local plane" convenience belongs to **packaging/bootstrap**, never to the cockpit's runtime identity — the attach-or-own / self-supply machinery is retired as FM's identity (C5 #16746 executes the demotion; blast-radius inventory first; sequenced LAST, behind the proven remote-only journey).

Three authorities — "FM" stops naming all of them at once:

1. **Fleet cockpit client** — renders, requests. Never starts organism children; never imports runtime trust primitives from a checkout.
2. **Plane-owned Fleet control service** — owns agent-definition/lifecycle policy, request-time seat identity, audit, and the logical plan (the D#16176 service; the #16715 / PR #16731 pure-plan ÷ host-apply split is what makes role 2 → role 3 honest).
3. **Host actuator** — owns host paths, hydration, filesystem convergence, process spawn/stop, signed receipts. It cannot decide identity, registry, credential, or authorization policy.

And **two registries, not one**: client **connection profiles** (endpoint, public descriptor, the client's encrypted or env-indirected credential) live client-side; **agent definitions, lifecycle state, and plane-side credential references** are plane-owned — the truth the Fleet service serves. The Body receives **public projections and a session capability only, never the credential**. Three client custodian shapes are real today (seat-witnessed): Electron main (packaged) · session-only (browser dev) · env-indirection client file (headless CLI seats, production-proven).

The fleet surface itself is the **optional `fleet-server` compose service** (D#16176-inherited selection; S1 #16735 carries the executable contract ledger: request-time `AuthService` admission, exact-match `/fleet` + `/fleet/probe` ingress routes, `AiConfig.fleet.dataDir` per ADR 0019, identity-bearing readiness).

### 2.2 The four non-aliased identity facts

Kept separate **by construction** — each fact has its own carrier, and no fact substitutes for another:

| # | Fact | Carrier | What it is NOT |
|---|---|---|---|
| 1 | **Who authenticated** | The forge login (`AuthService` exposes mutable login + stable provider metadata separately) | Never ownership — a DISPLAY/projection fact only; Memory Core may project it onto an auto-provisioned `AgentIdentity` for attribution |
| 2 | **Who owns Fleet state** | The opaque stable **`ownerPrincipal`**, backed by `(authProvider, normalizedProviderBaseUrl, providerUserId)` (D#16176-inherited) | Never the mutable provider login, never the `AgentIdentity` graph id — a login rename or a GitHub/GitLab namespace collision must never silently change ownership |
| 3 | **Who may see the roster** | Fleet's own grant family: `CAN_OBSERVE_FLEET_OF(granteePrincipal, ownerPrincipal)` for owner-scoped read projections; `CAN_ADMINISTER_FLEET_OF` for curated lifecycle verbs. **DEFAULT-PRIVATE**, even inside a trusted team deployment | Never inferred from authentication, team membership, or content grants |
| 4 | **Who may read agent content** | Memory Core's independent `CAN_READ_INBOX_OF` / `CAN_READ_MEMORIES_OF` / `CAN_READ_SESSIONS_OF` (fail-closed) | Never widened, synthesized, or aggregated from roster visibility |

The operator↔agent association used for roster composition is a **derived relation keyed to the owner principal** (S4 #16738) — never a second ownership source.

**Binding negative ACs** (graduation criterion 6): read credentials cannot invoke lifecycle writes; lifecycle credentials cannot express arbitrary host operations; a host actuator cannot re-derive identity or policy; ownership never keys on a mutable login; roster grants never widen content visibility.

### 2.3 Two grant families + the at-rest coherence invariant

The Fleet observe/administer family and the MC content family are **separately receipted and never aggregated** — no single granularity enum, no synthesis. The sharing UX (C4 #16745) presents both families as what they are, per target operator.

**The grant-set coherence invariant** — converged as a **state predicate**, not an operation rule: *at rest, every content grant's target is roster-visible to the grantee.* Because it is stated over the grant SET, mint, revoke, operator departure, and identity retirement are ALL bound by the one invariant; enforcement lands wherever a mutation could violate it (auto-extend, cascade-dispose, or refuse — a per-operation choice). The revoked-observe / retained-content pair ("you may read the memories of someone who does not exist for you") is **forbidden as a state, reachable from either direction**.

**The revocation re-render falsifier** (S5 #16739 runs it against the real projection; repo precedent #15178): the sharp question is what the re-render does to rows the revocation did NOT target. Four assertions, in order: (1) the revoked row leaves; (2) **no collateral re-materialization** — every untargeted row's identity + presence band unchanged; (3) an emptied roster renders scoped-empty-with-reason, never `dark`; (4) the revoked-observe/retained-content pair is refused or repaired, never silently held. If plain re-query holds assertion 2, the concern is discharged; if not, the roster takes the #15178 **owner-parking boundary** (retire the genuinely absent; park the temporarily unrenderable-but-owned) — never a naive re-query.

### 2.4 The truth-rendering cockpit (the presence contract, recorded)

The roster is a **viewer-scoped plane-graph projection** rendered under a truth-preserving presence contract (S3 #16737 enforces; C3 #16744 carries the remote-state banner vocabulary):

- **Tier-degradation rendering contract** (operator-ratified): a liveness tier a deployment cannot emit produces **ABSENCE OF SIGNAL, never a verdict**. Per-peer presence renders from the tiers that ANSWERED and names them; recency is the portable floor; tiers order by portability, not precision.
- **Presence is BANDED, not boolean** — two horizons (`freshUntil` / `expiresAt`); the vocabulary is the band set (active-turn / fresh / recent / dark).
- **Three independent signals, none inferring another:** presence-fresh ≠ wake-route-healthy ≠ identity-bound. A cockpit whose VIEWER binding is broken renders "binding unavailable", never "no peers online". Wake-route health renders from subscription STATE, never delivery-event counts (delivery is at-least-once).
- **Scoped emptiness is distinguishable from dead-plane emptiness:** the default-private empty state carries its reason ("plane alive · N operators present · 0 agents shared with you · request access") — the same reason-carrying vocabulary class PR #16721 shipped for connection truth. Process liveness of locally-actuated children stays role-3 actuator telemetry reported UP to the plane (signed receipts), never sideways as fleet truth.

### 2.5 Authentication by adoption; authorization by grants + ledger

PAT-grade auth **adopts shipped substrate as the authentication SOURCE, not as authorization**: `ai/mcp/server/shared/services/AuthService.mjs` (`NEO_AUTH_MODE` ∈ `local-bearer` / `gitlab-pat` / `github-pat`) validates the bearer and yields forge identity; the fleet surface occupies the same seat kb/mc occupy (S2 #16736; admission subject = `ownerPrincipal`, login = display). Authorization is the §2.2/§2.3 grant families plus the **credential-class ledger — the canonical table is §2.5.1** (landed by S6 #16740, ADR 0019 §10.8-consistent): six distinct classes, **no silent substitution**, with tunnel-delegated transport dispositioned accepted-with-conditions.

### 2.5.1 The credential-class ledger (canonical — the S6 #16740 deliverable)

One row per class. The **non-alias rule is load-bearing on every row**: two classes may be minted by the same issuer, but a credential admitted for one class NEVER silently serves another — five distinct secrets already coexist on one production seat (seat-witnessed, D#16720 cycle-2). Subject cells that name `ownerPrincipal` bind the TARGET contract: its derivation/normalization is S2 #16736 + S4 #16738 authority, and until those land, principal-bound surfaces fail closed (the S1 #16735 v3 discipline).

| # | Class | Issuer | Subject | Audience | Scopes | Custody | Persistence | Rotation / revocation | Transport requirement | Non-alias rule |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **FM client → Fleet plane admission bearer** | Forge (PAT or OAuth-derived bearer), validated by `AuthService` | The stable `ownerPrincipal` (target: S2/S4); the mutable login is display-only (§2.2 fact 1) | The plane's fleet surface (`/fleet` + `/fleet/probe` via ingress) | Read (roster/registry projections) ÷ lifecycle (curated verbs behind `CAN_ADMINISTER_FLEET_OF`) — distinct envelopes per verb class, never one blanket scope | Client-side, per the three custodian shapes (§2.1): Electron main / session-only browser-dev / env-indirection file; the Body receives a session capability, never the credential | Client connection profile (encrypted or env-indirected); never plane-side plaintext | Forge-side revocation is authoritative (next request fails admission); client re-mints into its profile | Cloud: TLS at ingress. Local: loopback HTTP. Tunnel-delegated: accepted-with-conditions (below) | ≠ bootstrap/healthcheck PAT, ≠ class-4 workflow PAT — the same forge may mint both; the plane-admission mint is its own credential |
| 2 | **Body → shell IPC session capability** | The shell custodian (Electron main) at connection establishment | The renderer session — a window identity, never an operator identity | The shell's IPC boundary only | Invoke the client connection broker (typed requests); zero credential-read capability | Shell process memory; never renderer-readable state (ADR 0034 §2.3 fail-closed contract) | Session-lifetime only; never durable | Dies with the session; the shell revokes unilaterally | In-process IPC (`contextBridge`) — never a network hop | Possessing the capability ≠ holding class 1; the capability cannot be exported into a network credential |
| 3 | **Managed seat → remote MCP bearer** | Forge PAT minted for the seat | The seat's forge identity → its auto-provisioned `AgentIdentity` binding (attribution projection, §2.2 fact 1) | MC/KB MCP surfaces (`/mc/mcp` + `/kb/mcp` via ingress) | The MCP tool surface admitted for that identity; server-side permission gates own authorization | **Env-indirection client file** — `Authorization: Bearer ${VAR}`, no inline secret in config or argv (production-proven custodian shape; the D#16720 cycle-2 seat witness) | Host env/config outside the repo; never committed | Forge-side revocation; the seat's client file re-points on re-mint | Loopback HTTP to host-local ingress, TLS to cloud ingress; tunnel-delegated forwards run in production today under the conditions below | ≠ class 1 (plane admission) and ≠ class 4 (repo writes) — one seat holds all three as distinct mints |
| 4 | **Repository-workflow credential (seat → forge)** | Forge (PAT with repo-scoped grants) | The seat's machine account on the forge | Forge REST/GraphQL APIs | Repo/workflow/project-class scopes as operator-minted (live example: a seat token without `read:org` — REST fallbacks exist by design) | Harness environment (`GH_TOKEN`-class); never argv, never committed | Host env | Forge-side; operator-managed | TLS to the forge | ≠ classes 1/3: a forge PAT that writes to the REPO is a different mint than one that admits to the PLANE — identical issuer, distinct credential |
| 5 | **Plane controller → host actuator envelope** | The plane's Fleet control service (signing key in the Fleet-owned root) | The commanding controller identity | Exactly one host actuator | Command-scoped plan/apply (the #16715 / PR #16731 seam) + one-shot secret redemption (D#16176-inherited) | Plane-side signing key; the host holds only the verification trust anchor | Per-command envelopes, replay-bounded (nonce + expiry); no standing bearer exists | Plane rotates the signing key; host trust re-provisioned explicitly | Signed HTTP over a confidential channel — RFC 9421-aligned signature for integrity/authenticity PLUS TLS, or a loopback / condition-(2) confidential tunnel hop, for confidentiality (D#16176's selected default); one-shot secret redemption returns secret bytes only over that confidential authenticated channel, never signature-only plaintext | ≠ every bearer class: possession of a class-1 admission bearer NEVER signs an actuator command; role 3 cannot re-derive authority (§2.1) |
| 6 | **Signed-wake HMAC (plane → wake receiver)** | The plane, per subscription (plane-held secret) | The subscription (identity × route) — never the operator | The seat's wake receiver (today: the local signed Shape-B receiver; target: the ingress-wake channel, S7 #16741) | Wake delivery only — carries ZERO read/write authority | Shared secret held by plane + receiver; per-subscription isolation | Subscription lifetime | Owner-scoped `rotateKey` rotates the HMAC in place (the one rotation door; re-subscribe is deliberately idempotent — an existing route returns WITHOUT minting a key); unsubscribe revokes | Local-only delivery today (ADR 0014); S7 moves it onto the authenticated ingress | ADR 0019 §10.8's own named class — never the admission bearer, never the process bearer, never a content grant |

**Tunnel-delegated transport — dispositioned ACCEPTED-WITH-CONDITIONS** (the OQ5 remainder; today's fleet runs one in production, seat-witnessed): (1) both tunnel ends terminate on loopback-bound listeners; (2) the tunnel itself provides the hop's confidentiality + integrity (ssh / VM-boundary class); (3) the credential requirement is UNCHANGED — a tunnel is a pipe, never an identity, so transport never substitutes for admission; (4) the deployment names the tunnel in its runbook — an unnamed tunnel is a shadow topology. **REFUSED:** plaintext HTTP forwarded across a host boundary without a confidentiality layer, and any configuration where reaching the listener is treated as authentication (the #15320 thesis: ambient reachability ≠ viewer identity).

**Boundary — provider secrets are adjacent, not rows:** the deployment's provider credentials (the ADR 0019 §10.8 census's two secrets: OpenAI-compatible + KB ask) are deployment inputs consumed plane-side; they never enter client connection profiles, never transit the fleet wire, and are not FM-topology credentials. Naming them here prevents the seventh-row mistake: a ledger that absorbs every secret in the system stops being a client-topology contract.

### 2.6 The storage boundary (binding — D#16176 Option A)

The Fleet service owns a **Fleet-owned, entrypoint-fixed durable root**. Graph, mailbox, and roster facts cross **authenticated registered projections / service APIs — NEVER a mount or schema-read of another service's private storage** (the co-located shared-volume facade is D#16176's REJECTED Option B). S1 scopes the root to what S1 owns (registry, tenant, key material); grants/audit/lifecycle durability belongs to their named slices.

### 2.7 Profiles — optionality is profile-specific

| Profile | Fleet service | Rationale |
|---|---|---|
| **Local Agent OS + downloadable FM** (the v13.2 product profile) | **REQUIRED** | A fresh install must render a live plane-owned roster — empty/offline on first double-click is the product state the roadmap's done-signal forbids |
| **Headless cloud deployment** | Optional | Omit when no cockpit connectivity is wanted; optionality is also a CUSTOMER choice, not only a topology fact |
| **Browser-only dev** | Session-only convenience | Must not weaken the packaged-client credential boundary |

**The recorded OQ3 working position** (open for packaging mechanics, position survives unless falsified in this ADR's review): **bundle = organism; Body-first first-render.** The living Body boots with zero infrastructure and is instantly alive; the containers rise behind it; the cockpit renders truthful connection states throughout — the double-click never lands on empty/offline. Own-mode packaging mechanics stay a C-side follow-up.

### 2.8 The wire-only client contract

The client SDK home (#16710; C2 #16743 consumes it) carries **method/schema vocabulary, protocol version, capability negotiation, and closed response states — nothing else**. Server-side identity normalization, bearer validation, ownership, and authorization never cross. Acceptance property, verbatim from graduation: *a client can speak the versioned Fleet protocol without importing or reconstructing any server trust decision.*

**The remote-only journey AC** (graduation criterion 7, the topology's end-to-end falsifier): a cockpit on a machine with **NO Neo checkout and NO host Fleet registry** connects to a plane, renders the plane-owned roster, **and has a working wake story** (wake delivery over the same authenticated ingress — poll or server-initiated, S7 #16741 — because pull-bridge wake push terminates on a host listener a no-checkout machine cannot be) with **zero local `ai/` imports**.

## 3. Amendments recorded in the sibling ADRs (this PR)

### 3.1 ADR 0020 §3 + §4 — re-scoped for the pure client

- **§3's sentence is rewritten in place** — from "the Agent OS runs in-process in the Electron main (target)…" to the packaged product **bootstrapping the local Agent OS plane** from the Electron main (bundle = organism, §2.7 above) as host machinery beneath the fleet wire — never the cockpit's runtime identity. A note alone cannot re-mean a superseded sentence (reviewer principle, PR #16752 RA-1); the sentence now states the truth and the bracket note carries provenance. The #13033 hosting-arm decision is untouched.
- **§4 guardrail 4 "Fleet lifecycle owns restart affordances"** — restart affordances are **plane-owned surfaces** behind `CAN_ADMINISTER_FLEET_OF`, invoked over the authenticated fleet wire. The cockpit requests and renders outcomes; it never owns the affordance. (Runtime MCP-server restarts with settle-or-reject semantics remain plane-side contracts.)

### 3.2 ADR 0026 §2.7 — the reserved fold, executed

ADR 0026 §2.7 deliberately kept the client-reachable Fleet `restartAgent` outside the daemon-core authority model "unless a later Discussion deliberately folds it in." **D#16720 is that Discussion.** The fold: `restartAgent` joins the authority model as a client-reachable **curated fleet-lifecycle verb** gated by `CAN_ADMINISTER_FLEET_OF` (§2.2 fact 3) — while the daemon-core `control-plane/` lifecycle-write seam stays physically separate and control-plane-principal-gated. The **read-observe ÷ lifecycle-write envelope split is preserved on both surfaces**; neither fold direction widens the other's envelope.

### 3.3 ADR 0034 §2.1 + §2.6.4 — the accepted shell record carries the amendment

ADR 0034 is the **accepted, shell-specific successor** of ADR 0020 §3 and still taught the packaged-host topology as the cockpit's identity. A successor ADR does not supersede an accepted, more-specific record merely by being newer — **the amendment must land at the statements a future session will retrieve** (PR #16752 RA-1; the KB retrieval surfacing 0034 beside 0020 was the falsifier for "0020 + 0026 are the complete predecessor set"). So 0034 now carries: **§2.1's hosting frame re-scoped** as the bundled plane's BOOTSTRAP — role-3 host machinery, with bindings 1–5 surviving as bootstrap-machinery contracts (binding 1 = the bundled plane's bootstrap-supervisor authority; binding 2's settle-or-reject = a plane-side contract whose affordances surface behind `CAN_ADMINISTER_FLEET_OF`); the "attach-to-external stays dev-mode" sentence **superseded** (CONNECT is the cockpit's only mode; profiles vary in whether the shell also bootstraps a local plane, §2.7); and **§2.6.4's dev-attaches/packaged-hosts dichotomy re-bound** as one client contract over two bootstrap arms.

## 4. Considered alternatives (rejected — from the D#16720 divergence matrix, terminal dispositions)

- **Fleet wire as an orchestrator-owned ingress endpoint.** Rejected: couples interactive load to maintenance authority (duty-cycle deferrals observed live during smoke) and collides with ADR 0026's control-plane separation.
- **Host transport as the product's fleet truth (proxy/interception).** Rejected on the structural falsifier: traffic-slice incompleteness, seat-confirmed — a host-side reconstruction sees only what transits that host. Permitted only as a transitional dev-adapter with zero data/policy authority.
- **Local-file roster.** Rejected: the hard cut removed the host registry; a stale local graph cannot show a live peer.
- **Login-keyed ownership.** Rejected: renames and forge-namespace collisions silently reassign state; ownership keys on the opaque `ownerPrincipal`.
- **One aggregated grant surface.** Rejected: roster visibility and content access have different blast radii; aggregation forbids the coherence invariant's per-family enforcement.

## 5. Consequences

**Positive:** one client contract serves every plane placement (local compose, cloud, future multi-plane) — the cockpit stops being a topology-dependent fork; the v13.2 "FM with data" gate becomes reachable (a data-less FM cannot pass the roadmap's done-signal); identity/visibility bugs become contract violations with named falsifiers instead of UX surprises. **Negative / cost:** the local product profile now operates one more service; two grant families must be administered (C4 owns the UX that keeps that honest); the presence contract obliges every roster surface to carry band + tier provenance. **Boundary:** this ADR records client topology and cross-cutting identity/visibility contracts — per-leaf executable contracts (compose/Caddy/AiConfig rows, verb tables, projection shapes) live in the S/C sub bodies, and control-plane authority remains D#16176/#16168.

## 6. The session-intake recipe

A future session picks this up in three steps: (1) read THIS ADR (~4 minutes); (2) glance the v13.2 milestone for the live S/C leaf state; (3) open the target leaf only — its body carries the executable contract. D#16720 is archaeology; D#16176 is the control-plane parent when authority questions arise. **Cold-read contract:** if a fresh session cannot state the three roles, the four identity facts, and the two grant families from step 1 alone, this ADR has failed and gets amended — file the friction.

## 7. Related

- **Discussion #16720** — graduation archaeology (12 body versions, divergence matrix, falsifier receipts).
- **#16747** — the D1 carrier this ADR resolves; **Epic #16168** — control-plane parent; **D#16176** — the graduated control-plane authority.
- Subs informed: S1 #16735 · S2 #16736 · S3 #16737 · S4 #16738 · S5 #16739 · S6 #16740 · S7 #16741 · C1 #16742 · C2 #16743 · C3 #16744 · C4 #16745 · C5 #16746.
- **ADR 0020** (harness concept — §3 sentence rewritten, §4 re-scoped) · **ADR 0026** (recovery actuator — amended §2.7) · **ADR 0034** (Electron shell — amended §2.1 + §2.6.4) · **ADR 0019 §10.8** (credential taxonomy) · **ADR 0014** (deployment topology).
- `ai/mcp/server/shared/services/AuthService.mjs` · `ai/services/fleet/` (devFleetServer/fleetBridgeServer — the pre-topology surface C1/C5 migrate) · `ai/deploy/docker-compose.local-agent-os.yml` + `ai/deploy/Caddyfile*` · `learn/agentos/cloud-deployment/ClientAuthentication.md`.
- PR #16721 (connection-truth banner — the reason-carrying vocabulary class §2.4 reuses) · PR #16731 (plan/apply split — the role-2→3 honesty prerequisite).

---

Origin Session ID: `e676cd5d-52ce-4d38-89ab-a4621c88a382`

Retrieval Hint: `query_raw_memories("FM client topology four identity facts two grant families ownerPrincipal ADR 0038")`
