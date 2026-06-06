# ADR 0014: Cloud Deployment Topology + Scheduler Task Taxonomy

> Architectural Decision Record for the **D0** critical-path workstream of Epic #11720 (*Cloud Agent OS Deployment Readiness*, graduated from Discussion #11718). Classifies every `Orchestrator` scheduler lane as `cloud-deployable` / `local-only` / `shared primitive`, and records the target production deployment topology. This ADR is the decision input that unblocks Sub B (#11723), Sub C (#11724), Sub D (#11725), and Sub F1 (#11727).

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-21 (D0 decision record merged via PR #11738 with cross-family review, per ADR 0005 lifecycle) |
| **Author** | @neo-opus-4-7 (Claude Opus 4.7) drafting; substrate-truth grounded in the live `ai/daemons/` source audited at `dev` |
| **Resolves** | #11721 — *"Cloud deployment topology + scheduler-task-taxonomy ADR"* (D0 of Epic #11720) |
| **Graduated from** | Discussion #11718 (*Cloud Agent OS Deployment Readiness*) → Epic #11720 |
| **Unblocks** | #11723 (Sub B — container topology), #11724 (Sub C — reference compose), #11725 (Sub D — healthcheck / journey proof), #11727 (Sub F1 — cookbook) |
| **Informs** | #11722 (Sub A — deployment-mode feature toggles), #11726 (Sub E — tenant-repo ingestion model) |
| **Anti-anchor for** | Containerizing the mixed-responsibility `Orchestrator` as-is; mono-container deployment; ADR-as-options-workspace |

---

## 1. Context

Epic #11720's mission: an external dev team can deploy Neo's Agent OS (KB + MC MCP servers + `Orchestrator` + supporting infra) into a containerized cloud environment and use it against their own repositories — *without tacit maintainer knowledge*.

The blocking gap is not a missing capability — it is **substrate drift plus an un-containerizable supervisor**. `ai/deploy/docker-compose.yml` is a stale 3-service baseline (`chroma` + `kb-server` + `mc-server`) and carries **no `Orchestrator`**. And the `Orchestrator` cannot simply be added: `Neo.ai.daemons.Orchestrator` is a **mixed-responsibility local Agent OS supervisor**. Its `poll()` loop schedules one task set that interleaves cloud-relevant maintenance lanes with local-maintainer-only lanes (`git pull origin/dev`, local-worktree discovery, `osascript` / `tmux` desktop-harness wake-delivery). Containerizing it as-is drags local-only behavior into a cloud tenant deployment.

D0 is the **first** Epic workstream because the topology cannot be designed until every scheduler lane is classified. **The classification *is* the unblock:** once the local-only lanes are identified and excluded by config, the `Orchestrator` has no local-checkout / git / desktop-harness dependency and containerizes cleanly.

**Substrate audited at `dev`:** `ai/daemons/TaskDefinitions.mjs`, `ai/daemons/Orchestrator.mjs#poll`, `ai/daemons/services/PrimaryRepoSyncService.mjs`, `ai/daemons/wake/daemon.mjs`, `buildScripts/ai/syncKnowledgeBase.mjs`, `ai/daemons/services/GoldenPathSynthesizer.mjs`, `buildScripts/ai/backup.mjs`, `ai/deploy/docker-compose.yml`.

## 2. Decision

### 2.1 Scheduler task taxonomy

`Orchestrator.poll()` drives **nine** scheduler lanes (`buildTaskDefinitions()` + the `continuousTasks` set). Each is classified `cloud-deployable`, `local-only`, or `shared primitive`:

| Lane | Kind | Classification | Rationale |
|---|---|---|---|
| `chroma` | continuous | **shared primitive** | The unified vector store (ADR 0003). Both profiles need it; in cloud it is a dedicated compose-managed container with its own `healthcheck:`, not an `Orchestrator`-supervised child. The `Orchestrator`'s `chroma` supervision is the local-dev substitute for compose. |
| `bridgeDaemon` | continuous | **local-only** | `ai/daemons/wake/daemon.mjs` delivers A2A wake digests to *local desktop agent harnesses* via `osascript` (macOS) / `tmux` keystroke simulation. A cloud tenant deployment has no local harness apps to key into. (A2A *message storage* via the MC server stays cloud-relevant — distinct from this wake-*delivery* daemon.) |
| `mlx` | continuous (default off) | **local-only** | `mlx_lm.server` is macOS / Apple-Silicon local inference. Cloud model inference is a *provider-profile* decision (external API default; an optional self-hosted container is a D1 variant) — not an `Orchestrator` child. Already `NEO_ORCHESTRATOR_MLX_ENABLED`-gated, default `false`. |
| `summary` | periodic, heavy | **cloud-deployable** | `summarize-sessions.mjs` digests agent sessions from the graph and writes summaries back. No local-checkout dependency (verified — no git / spawn). Needs a model-provider endpoint. Config-gated per deployment. |
| `kbSync` | periodic, heavy | **local-only** | `syncKnowledgeBase.mjs` runs `KB_DatabaseService.syncDatabase()` — a full re-scan of the **Neo repo's own corpus** from the local checkout, also cascaded after a `dev` pull. A cloud tenant's KB content arrives via push-based `ingest_source_files` (Sub E #11726), not this local cascade. |
| `backup` | periodic, heavy | **cloud-deployable** | Backup → external-volume → redeploy-survival is an explicit Epic AC. `backup.mjs` exports the Chroma + SQLite substrates; not local-checkout-bound. (Its best-effort `git rev-parse HEAD` bundle-meta stamp degrades to `null` without `.git` — graceful; a Sub C awareness note, not a blocker.) |
| `primary-dev-sync` | periodic, heavy | **local-only** | `PrimaryRepoSyncService` is pure local-maintainer machinery: `git fetch` / `pull --ff-only origin/dev`, worktree discovery, `resources/content/.sync-metadata.json` reset, local `ai:sync-kb` cascade. The Epic's cloud-profile negative-behavior AC names exactly this lane's behaviors as forbidden. |
| `dream` | periodic, heavy | **cloud-deployable** | DreamService REM-sleep graph extraction — Memory Core intelligence. No local-checkout dependency (verified — no git / spawn). Needs a provider endpoint. Config-gated per deployment. |
| `golden-path` | periodic, light | **cloud-deployable** | The core Hybrid GraphRAG synthesis (Chroma semantic + SQLite structural scoring → the Computed Golden Path) is pure Memory Core graph/vector — cloud-correct. **Caveat:** two enrichment sections — "Active PR Cycle State" (`gh pr list`, hardcoded to the Neo swarm logins) and "Latest Priority Backlog" (a local `resources/content/issues` scan) — are Neo-maintainer-repo-specific. Both degrade gracefully (`try/catch` → empty section), so the lane *runs* correctly in cloud, but they are inert noise in a tenant deployment → deployment-mode-gate via Sub A #11722. |

**Summary:** cloud-deployable = `{summary, backup, dream, golden-path}` · local-only = `{bridgeDaemon, mlx, kbSync, primary-dev-sync}` · shared primitive = `{chroma}`.

### 2.2 Target production deployment topology

A **multi-container** topology — per-service resource isolation is the devops concern motivating the mission; a mono-container defeats it. Logical services:

| Service | Container | Today | D0 decision |
|---|---|---|---|
| `chroma` | dedicated | exists | keep; the unified vector store per ADR 0003 |
| `kb-server` | dedicated | exists | keep; add a Docker `healthcheck:` block (today only `chroma` has one) |
| `mc-server` | dedicated | exists | keep; add a Docker `healthcheck:` block |
| **`orchestrator`** | **dedicated — NEW** | **absent** | **the core D0-unblocked gap** — a new container running the cloud-safe `Orchestrator` profile (§2.3) |
| model provider | endpoint (not necessarily a container) | absent | a swappable provider profile; an external API is the MVP default; a self-hosted provider container is a **D1 variant**, not the MVP. The `Orchestrator` *consumes* a provider endpoint — model runtime is **not** co-located with it by default. |

Topology-level gaps recorded here and routed to their owning subs (D0 decides; it does not build):
- **Persistence / redeploy survival** — Chroma data, the SQLite graph, and backup bundles must sit on volumes that survive container rebuild. Today `chroma-data` + `shared-sqlite-data` volumes exist; **no backup volume.** → Sub C #11724.
- **Per-container resource limits** — absent entirely today. → Sub B #11723.
- **Deployed healthcheck / readiness semantics** — `kb-server` / `mc-server` / `orchestrator`. → Sub D #11725.
- **External exposure** — internal-`expose`-only today; reverse-proxy refs exist but are unwired (known port mismatch). → Sub C #11724.

### 2.3 The cloud-safe `Orchestrator` profile

The cloud `orchestrator` container runs `Neo.ai.daemons.Orchestrator` with **only the four cloud-deployable lanes** active (`summary`, `backup`, `dream`, `golden-path`) and **all four local-only lanes disabled by config**:

| Local-only lane | Disable mechanism | Today |
|---|---|---|
| `primary-dev-sync` | `NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED=false` | toggle **exists** (`parseEnabledFlag`) |
| `mlx` | `NEO_ORCHESTRATOR_MLX_ENABLED` | already default `false` |
| `kbSync` (standalone lane) | needs a deployment-mode toggle | **no clean disable today** |
| `bridgeDaemon` | needs a deployment-mode toggle (it sits in the hardcoded `continuousTasks` array) | **no per-lane disable today** |

D0 **decides** the cloud profile excludes those four lanes. The missing toggles (`kbSync`, `bridgeDaemon`) — plus deployment-mode gating for `golden-path`'s two Neo-repo-specific enrichment sections (§2.1) — are an implementation handoff to **Sub A #11722** (top-level `ai` deployment / maintenance config + deployment-mode feature toggles).

The `chroma` shared primitive is **not** `Orchestrator`-supervised in cloud — compose owns the `chroma` container lifecycle.

### 2.4 Cloud-profile negative-behavior contract

The cloud profile asserts the **absence** of local-only behavior. From the lane taxonomy, the cloud `orchestrator` container MUST NOT: run `git pull origin/dev`; perform local-worktree discovery; reset `resources/content/.sync-metadata.json`; cascade a local-checkout `ai:sync-kb`; deliver `osascript` / `tmux` desktop-harness wakes. These map exactly to the `primary-dev-sync` + `kbSync` + `bridgeDaemon` lanes. **Sub D #11725** owns the CI-safe negative assertion proving the cloud profile cannot execute this behavior (CI-safe vs heavyweight-provider proof separation per the Epic's Sub D test-lane note).

### 2.5 Stale-ADR sweep — 0003 / 0009

Per the Epic, D0 sweeps the two existing daemon-relevant ADRs:
- **ADR 0003 (Chroma Topology — Unified Only)** — **not stale.** It already anticipates an "independently hosted ChromaDB instance"; the cloud `chroma` container *is* that unified instance. Cross-referenced here as the authority for the `chroma` = shared-primitive classification. No amendment. *(Update 2026-05-29: ADR 0003 is subsequently amended by ADR 0017 — single flat `unified` store + dev/prod parity — refining the store's on-disk layout + persist-path config. The `chroma` = shared-primitive / one-container classification recorded here is unaffected.)*
- **ADR 0009 (Cross-Daemon Heavy-Maintenance Lease Inheritance)** — **not stale.** The file-lease serializes the heavy lanes (`summary` / `kbSync` / `backup` / `primary-dev-sync` / `dream`) across processes; in a single-`orchestrator`-container cloud deployment it is a degenerate-but-correct safety net. No amendment.

Broader deployment-doc / ADR reconciliation beyond 0003 / 0009 is tracked by the #11720 owner map and its follow-up tickets; #11729 was closed after D0 owner-map narrowing.

## 3. Decision Process — Rejected Alternatives

| Option | Rejection rationale |
|---|---|
| **Containerize the current `Orchestrator` as-is** | It is mixed-responsibility; it would drag `git pull origin/dev`, worktree discovery, and `osascript` wake-delivery into a cloud tenant deployment. The task taxonomy must split the lanes *first* — that is the entire reason D0 gates Sub B/C/D. |
| **Mono-container deployment** (one container, all services) | Defeats per-service resource isolation — the explicit devops concern motivating the mission. Heavy LLM-inference lanes (`summary` / `dream`) need a resource envelope distinct from the request-serving MCP servers. |
| **Drop the `Orchestrator` from the cloud MVP** (ship KB + MC + Chroma only) | The adoption-ladder proof requires `backup` → redeploy-survival, and the Memory Core digestion pipeline (`summary` / `dream` / `golden-path`) *is* the Agent OS's value. Shipping only the MCP servers deploys a data store, not the Agent OS. |
| **Co-locate the model runtime with the `Orchestrator`** | The `Orchestrator` is a control-plane process that *consumes* a provider endpoint. Bundling a model runtime couples a swappable profile choice to the control plane and inflates its resource envelope. Provider = endpoint profile (D1). |
| **Treat this ADR as an open A/B/C/D options workspace** | An ADR is a decision *record* — chosen outcome + rejected options — per ADR 0005 / 0006. D0 records a made decision; D1–D4 variant exploration belongs to the owning subs. |

## 4. Consequences

### Positive
- **The `Orchestrator` becomes containerizable** — excluding the four local-only lanes by config removes every local-checkout / git / desktop-harness dependency. The taxonomy *is* the unblock.
- **Sub B / C / D / F1 are unblocked** with a decided topology and a classified lane set, instead of guessing.
- **The cloud profile is contract-bound** — the negative-behavior contract (§2.4) gives Sub D a precise, falsifiable assertion target.
- **Profile-derived service count** — the container count follows the topology (§2.2), not a target number.

### Negative / handoffs
- **Sub A #11722 must add new deployment-mode toggles** — `kbSync` and `bridgeDaemon` have no clean disable today; `bridgeDaemon` additionally sits in a hardcoded `continuousTasks` array, so making it config-disableable is a small `Orchestrator.poll()` change.
- **`golden-path` carries Neo-maintainer-repo-specific enrichment** — its "Active PR Cycle State" (`gh pr list`) and "Latest Priority Backlog" (`resources/content/issues` scan) sections degrade gracefully but emit per-cycle warnings + dead sections in a tenant deployment. Routed to Sub A #11722 for deployment-mode gating; a friction → gold cleanup, not an MVP blocker.
- **The digestion lanes (`summary` / `dream` / `golden-path`) need a reachable provider endpoint in cloud** — a deployment without a configured provider runs a degraded Agent OS. The provider-profile decision (D1) is a near-dependency, not fully independent.

## 5. Anti-Patterns

### 5.1 Re-merging local-only lanes into the cloud profile
A change that enables `primary-dev-sync` / `kbSync` / `bridgeDaemon` in a cloud deployment re-introduces the un-containerizable mixed-responsibility shape. The cloud profile's lane set is a contract, not a default-config convenience.

### 5.2 Feeding the cloud KB through `kbSync`
The cloud KB is fed by (a) the pre-baked Neo-shared corpus and (b) push-based tenant ingestion (Sub E #11726). Re-pointing the local `kbSync` lane at tenant content re-couples the cloud deployment to a local-checkout scan model.

### 5.3 Letting the container count lead the topology
Service boundaries derive from the lane taxonomy + resource-isolation needs. Picking "N containers" first and back-filling responsibilities inverts the decision.

### 5.4 Treating graceful degradation as cloud-readiness
`golden-path`'s Neo-repo enrichment sections *degrade* gracefully — they do not *belong* in a tenant deployment. Graceful degradation is a safety net, not a substitute for deployment-mode gating.

## 6. Boundary — What D0 does NOT decide

- **The compose / Dockerfile implementation** — Sub B #11723 (multi-container, resource limits, profile variants) + Sub C #11724 (reference compose, proxy / TLS wiring, redeploy-safe persistence).
- **Healthcheck implementation + journey proof** — Sub D #11725.
- **The model-provider profile** (external API vs self-hosted container) — D1, owned by Sub B's decision record.
- **Server-side repo cloning** — a D3 exploration; out of scope (push-based ingestion is the MVP default).
- **SQLite → networked-SQL graph-store migration** — D5; deferred (Epic #11730 residual).

## 7. Related

- **Epic:** #11720 (Cloud Agent OS Deployment Readiness)
- **Resolves:** #11721 (D0)
- **Origin Discussion:** #11718 — §5/D0; orchestrator-role-split anchor `DC_kwDODSospM4BA4F9`
- **Unblocks:** #11723, #11724, #11725, #11727
- **Informs:** #11722 (Sub A — the toggle + `golden-path`-gating handoff), #11726 (Sub E — the local `kbSync` exclusion is *why* push-based ingestion is the cloud KB path)
- **ADRs:** 0003 (unified Chroma — swept, not stale), 0009 (cross-daemon lease — swept, not stale), 0005 (ADR-at-graduation), 0006 (ADRs as graph-queryable entities)
- **Substrate:** `ai/daemons/TaskDefinitions.mjs`, `ai/daemons/Orchestrator.mjs`, `ai/daemons/services/PrimaryRepoSyncService.mjs`, `ai/daemons/wake/daemon.mjs`, `buildScripts/ai/syncKnowledgeBase.mjs`, `ai/daemons/services/GoldenPathSynthesizer.mjs`, `buildScripts/ai/backup.mjs`, `ai/deploy/docker-compose.yml`

## 8. Amendments

### 2026-05-22 — `swarm-heartbeat` lane added to the taxonomy (#11766)

After this ADR was accepted, [#11766](https://github.com/neomjs/neo/issues/11766) folded the swarm heartbeat from a standalone launchd daemon (`ai/scripts/swarm-heartbeat-daemon.mjs` + `swarm-heartbeat.sh` + `com.neomjs.swarm-heartbeat.plist`) into an `Orchestrator` scheduler lane. The §2.1 taxonomy is amended to include it — the `Orchestrator` now drives **ten** scheduler lanes, not nine.

| Lane | Kind | Classification | Rationale |
|---|---|---|---|
| `swarm-heartbeat` | periodic, light | **local-only** | `SwarmHeartbeatService.pulse()` delivers wake events to *local desktop agent harnesses* via `osascript` (macOS) / `tmux` keystroke simulation — the same wake-*delivery* dependency that makes `bridgeDaemon` local-only (§2.1). A cloud tenant deployment has no local harness apps to key into. (A2A *message storage* + the TTL sweep stay cloud-relevant — distinct from this wake-*delivery* lane.) |

**Updated summary:** cloud-deployable = `{summary, backup, dream, golden-path}` · local-only = `{bridgeDaemon, mlx, kbSync, primary-dev-sync, swarm-heartbeat}` · shared primitive = `{chroma}`.

**Cloud disable is a config default, not a hardcode.** The cloud `Orchestrator` profile disables the lane via the `localOnly.swarmHeartbeatEnabled` config key (`NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED` env override) — resolved by the same `assignLocalOnlyToggle` deployment-mode mechanism §2.3 uses for the other local-only lanes. The lane is not stripped from the build. This is the deliberate forward-compat seam: post-v13, agents could run inside a container deployment, which would flip `swarmHeartbeatEnabled` back on with no code redesign. The lane's exclusion from the cloud profile is a profile contract (§5.1), not a permanent capability removal.

### 2026-05-23 — tenant-repo pull-ingestion lane + server-side-cloning boundary update (#11740)

Epic [#11731](https://github.com/neomjs/neo/issues/11731) (*Server-side tenant-repo ingestion for cloud Agent OS deployments*, graduated from Discussion #11782) adopts server-side pull-based tenant-repo KB ingestion as a post-MVP path **additive** to the #11726 push-based model. This amendment fires per §9's own re-review trigger — #11731 introduces a new `Orchestrator` scheduler lane — and updates the §6 scope boundary. ADR successor-risk verdict (per `adr-successor-risk-audit.md`): `adr-amendment-required` — the §2.1–§2.4 D0 MVP decision is **not** invalidated, so this is an amendment, not a supersession.

**§6 boundary updated.** §6 records *"Server-side repo cloning — a D3 exploration; out of scope (push-based ingestion is the MVP default)."* That boundary was correct **for Epic #11720's D0 MVP** and the MVP default is unchanged. Epic #11731 is the post-MVP follow-up that brings server-side pull-ingestion **into scope** — as an additive tenant-ingestion option, not a replacement for push-based ingestion (#11726).

**New lane — decision-level classification (implementation: #11790).** #11731's decomposition routes the pull-ingestion lane to sub #11790 (*tenant-repo-sync scheduler lane*), backed by a persistent GitMirror primitive (#11788) and a diff-to-ingest envelope builder (#11789). Per §9, the lane is classified here at the decision level; #11790 owns the `buildTaskDefinitions()` key, cadence config, and disable toggle.

| Lane | Kind | Classification | Rationale |
|---|---|---|---|
| `tenant-repo-sync` | periodic, heavy | **cloud-deployable** | Pulls tenant-repo content into the cloud deployment's KB via a credentialed persistent GitMirror (#11788) + diff-to-ingest envelope (#11789). It is the cloud deployment's tenant-ingestion path — cloud-correct by construction. It is the mirror image of the local-only lanes: config-disabled in the local Neo-maintainer profile (which has no tenant repos), exactly as the local-only lanes are config-disabled in cloud. Distinct from `kbSync` — see below. |

**`kbSync` is unchanged; §5.2 is reinforced, not weakened.** The existing `kbSync` lane keeps its §2.1 classification (**local-only** — the Neo-maintainer-checkout corpus scan). Tenant pull-ingestion is a **separate lane** (`tenant-repo-sync`) backed by a **separate primitive** (GitMirror, #11788) — *not* a re-pointed `kbSync`. §5.2's anti-pattern (*"Re-pointing the local `kbSync` lane at tenant content"*) stands and is reinforced: #11731 deliberately does not re-point `kbSync`; it adds the deliberate lane/service boundary §5.2 implied was the correct path. Maintainer-checkout `kbSync` and tenant pull-ingestion are two distinct concepts and must not be conflated.

**Credential boundary — recorded, not yet blessed deployable.** This amendment blesses the *architectural shape* (a distinct cloud-deployable lane) — it does **not** mark the pull-ingestion path production-deployable. Per #11740 AC4, the credential / token / env-var contract — credentialed repo access that persists no secrets in `repoSlug`, logs, manifests, or graph-visible config — is specified by sub #11787 and is a hard prerequisite before `tenant-repo-sync` is marked production-ready.

**Forward-looking taxonomy.** The lane does not yet exist in `buildTaskDefinitions()`; #11790 adds it. When #11790 lands, the `Orchestrator` will drive **eleven** scheduler lanes, and the cloud-deployable set becomes `{summary, backup, dream, golden-path, tenant-repo-sync}` (the local-only and shared-primitive sets unchanged).

## 9. Status / Lifecycle

- **Accepted** after PR #11738 merged to `dev` with cross-family review. Re-open the decision only if Sub B / C / D discovers evidence that invalidates the taxonomy.
- **Periodic re-review trigger:** any PR that enables a `local-only` lane in a cloud profile, or adds a new `Orchestrator` scheduler lane, MUST cite this ADR and classify the lane.

Origin Session ID: `8e1dc8ca-b5a5-4479-b3cf-31918eb4a5b2` (Epic #11720 / D0 #11721 graduation lineage; this ADR authored in the continuing #11720 implementation sprint)

Retrieval Hint: `query_raw_memories("cloud deployment topology scheduler task taxonomy D0 #11721 orchestrator local-only lanes")`
