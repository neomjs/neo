# ADR 0039: The Two-Plane SDK Barrel Boundary — A Host Entrypoint Cannot Reach a Durable Store by Import Alone

> `ai/services.mjs` unified two planes that no longer execute together. The SDK surface is split in
> two: a host barrel whose import cannot resolve a cloud-plane package, and the existing cloud root
> which keeps every service and remains the composition root for containerised work. The boundary is
> by grouping, not by rewriting services — one Proxy identity per service is preserved, and the
> validating-Proxy machinery moves below both barrels so neither reaches through the other.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-08-08 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005) |
| **Author** | @neo-opus-ada (Ada), grounded in a 114-importer consumer census, a static module-graph walk, and a spawned-process denial witness |
| **Resolves** | #16710 — the `Required: ADR` gate on the barrel split |
| **Graduated from** | Discussion #16652 — family-keyed quorum satisfied by the Kimi leg; the Fable signal was author-family |
| **Depends on** | The eager-singleton lifecycle in `core.Base`: `Neo.setupClass()` instantiates at module load and `initAsync()` is scheduled on the next microtask. This ADR's central claim is false if that changes. |
| **Aligns with** | ADR 0018 — and **explicitly NOT the Body/Brain seam.** Both barrels live in `/ai/`; Body is `/src/`. This is a **Brain-internal host-edge / container-plane** boundary, expressed by package resolution. An earlier revision called it the Body/Brain seam, which is a category error the two-hemisphere anchor exists to prevent; it is corrected here rather than silently, because the vocabulary gap that produced it is real — see §2.7 |
| **Mechanically amends** | `learn/benefits/ArchitectureOverview.md` — "The SDK Bouncer Pattern" and the `ai/services.mjs` module-table row, both of which name a single aggregator as the critical safety layer |
| **Anti-anchor for** | a host barrel that re-exports from the cloud root; a static-only proof presented as the whole property; a third barrel; deleting cloud services from the cloud root; treating `initAsync()` as deferral |

---

## 1. Context

`ai/services.mjs` was written when one process ran everything. It no longer describes reality: the
cloud plane runs in containers with the Brain package tier installed, while host processes — the
stdio MCP servers and their siblings — run on an operator machine that has only `npm install`.

A host process importing the unified barrel eagerly reaches three packages it does not have.
`chromadb` and `@google/generative-ai` arrive through static edges. `better-sqlite3` arrives through
`await import()` inside `initAsync()` — which **looks** deferred and is not, because the singleton is
constructed at module load and `initAsync()` runs on the very next microtask. **The deferral is
syntactic, not behavioural.**

The consumer graph had already voted before anyone wrote this down. Of 114 importers of
`ai/services.mjs`, 79 use only cloud exports and 22 only host ones. Exactly five span both, and four
of those are already-condemned demo/example debt.

## 2. Decision

### §2.1 Two barrels, split by export-prefix vocabulary

`ai/services.host.mjs` carries the host plane: the stdio MCP server surfaces (neural-link,
github-workflow), their GitLab sibling, and the shared destructive-operation guard.
`ai/services.mjs` remains the cloud root and keeps **every** service, host ones included, by
re-exporting them from the host barrel. The split is a boundary, not a deletion.

The axis is the export-prefix vocabulary the barrel already used. No service is rewritten.

### §2.2 The host barrel must not re-export from the cloud root

A re-export from `ai/services.mjs`, or a direct import of a Knowledge Base or Memory Core service,
restores the reachability the split removes — and does so invisibly. The failure mode is a host
process that boots cleanly on a developer machine with the packages installed and dies where they
are absent.

### §2.3 One Proxy identity per service

The validating-Proxy machinery lives in `ai/services/shared/serviceProxy.mjs`, **below** both
barrels. Both wrap at a single site, so a service imported through either barrel is the same Proxy
instance. Had the cloud root re-wrapped its re-exports, the same service would have had two
identities depending on the import path.

### §2.4 Inherited boot-policy compatibility — preserved debt with a named successor, NOT law

An earlier revision of this ADR said *"both barrels must apply"* the pre-split config writes. **That
was wrong and is retracted.** It would have institutionalized as architecture what is in fact
inherited debt, and it duplicated a forbidden pattern into a second site while doing so.

**ADR 0019 B4 forbids runtime writes to the reactive config SSOT. This ADR does not amend, weaken, or
carve out that rule.** One such write survives, as debt, at exactly one site.

**`GH_Config.data.syncOnStartup` — deleted.** Measured `false → false`: its leaf already defaults
`false`, so the write had no behavioural payload. It dated from a single-agent era when
`github-workflow` was a pure MCP server. A pure B4 violation carrying nothing.

**`NeuralLink_Config.data.autoConnect = false` — preserved at one owning site**,
`ai/services.host.mjs`. `ai/services.mjs` imports that module, so the cloud root inherits the policy
rather than repeating it. Verified: importing either barrel yields `autoConnect: false`, while a
process importing neither observes `true`.

It survives because removing it changes behaviour, and the reason is specific. `configBase.mjs`
defaults `autoConnect` to `true`; `ConnectionService.initAsync()` is the **sole** automatic caller and
gates on that value; and `mcp-server.mjs` — the canonical Neural Link host entrypoint — depends on it,
because `Server.boot()` awaits `ConnectionService.ready()` and never calls `ensureBridgeAndConnect()`
itself. **The config value is the connect decision.** Flipping the leaf to `false` was proposed,
probed, and falsified on precisely that entrypoint.

**Named successor, so this is a lane and not a permanent exemption.** Eliminating the write requires
choosing a lifecycle owner — explicit `Server`-owned connect, lazy service creation, or another
boundary — which is an architecture fork, not a cleanup. It belongs in an Ideation Sandbox. A fourth
option exists and may dissolve the question entirely: **splitting `AiConfig` itself by realm**
(post-v13.2 refactoring wave), after which each realm carries its own static default and no runtime
write is needed anywhere.

**Retirement trigger:** when that fork resolves, or when an `AiConfig` realm split lands, this write
is deleted and this section retires with it. Until then it stays at one site, labelled debt.

### §2.5 The property needs two instruments, and neither alone is sufficient

The acceptance property — *a host entrypoint cannot reach a durable store by import alone* — is
**not decidable by static analysis**.

- A **static module-graph walk** owns the reachable-by-declaration half and can see `chromadb` and
  `@google/generative-ai`.
- A **spawned process with a `module.register()` denial hook** owns the eager-lifecycle half and is
  the only instrument that observes `better-sqlite3`.

A green static walk is therefore never the whole property, and this ADR forbids presenting it as
such. The measurements disagree by exactly one package, and **that disagreement is the residual, not
an inconsistency to reconcile** — any figure quoted for this boundary must name the instrument that
produced it.

### §2.6 Rejected alternatives and their falsifiers

| Rejected | Falsifier |
|---|---|
| Make `chromadb` demand-lazy and keep one barrel | Attempted and closed unmerged. Moving the import into `initAsync()` is not deferral for an eager singleton; a runtime probe falsified it. |
| Host barrel re-exports from the cloud root | Restores full reachability; the denial witness fails immediately. |
| Static walk alone as the acceptance proof | Structurally cannot see `better-sqlite3`; a green run coexists with a false property. |
| Delete cloud services from the cloud root | The cloud plane is a legitimate consumer; the split is a boundary, not a deletion. |
| Flip the `autoConnect` leaf default to `false` | Falsified on the canonical Neural Link host entrypoint: `mcp-server.mjs` relies on the `true` default, because `Server.boot()` awaits `ConnectionService.ready()` and never connects explicitly. Probed directly — see §2.4. |

### §2.7 Vocabulary: this is a Brain-internal realm boundary, not the Body/Brain seam

Recorded because getting it wrong is easy and this ADR did. Body is `/src/`; Brain is `/ai/`. **Both
barrels are in `/ai/`,** so this boundary is *host-edge ↔ container-plane, inside the Brain.*

The failure is worth naming rather than only fixing: no established term existed for "a realm
boundary inside one hemisphere", so an author reaching for the nearest available vocabulary reached
for the seam that does have a name. Future placement work in this tree (`#14304`) should expect the
same pull — and that issue's own deferred gate calls for exactly this SSOT coherence.

## 3. Consequences and consumer obligations

- A host-plane consumer imports `ai/services.host.mjs`. A cloud-plane or spanning consumer keeps
  `ai/services.mjs`.
- Anything parsing `ai/services.mjs` **as a data source** must discover barrels rather than hardcode
  one path. `lint-openapi-service-parity` did not, and silently fell from 40 wrapped services to 23
  while reporting `OK` — a gate emptied by a refactor it could not see.
- New services join the barrel matching their plane. A service needing both is a design signal, not
  a reason for a third barrel.

## 4. Avoided traps

- **Treating `initAsync()` as deferral.** It is the trap that closed the previous attempt, and it is
  the reason §2.5 requires a runtime instrument.
- **Promoting a static-walk result into a runtime claim.** Recorded because it has now happened twice
  on this subsystem, by the same author, weeks apart.
- **Quoting counts across instruments.** A runtime resolve-hook count and a static-walk count are not
  commensurable; presenting them as one figure hides the unproven half.

## 5. Verification and liveness

- `test/playwright/unit/ai/services/hostBarrelImportReach.spec.mjs` — the static half, with a
  positive control proving the walker traverses a real graph.
- `test/playwright/unit/ai/services/hostBarrelRuntimeReach.spec.mjs` — the runtime half. Two failure
  directions: the cloud barrel must die under the identical denial, and the host barrel must die when
  a package it genuinely uses is denied. Both controls assert the *reason*, not merely the failure.

**Revalidation trigger:** if `core.Base` stops scheduling `initAsync()` on the next microtask, §2.5's
justification changes and the runtime witness must be re-derived rather than assumed.

## Decision Record impact

`REQUIRED` — this record. It amends `ArchitectureOverview.md` mechanically and takes no position on
the trust-envelope question of whether these tools should execute arbitrary JavaScript, which is
owned elsewhere.
