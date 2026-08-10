# Cloud Deployment — Downstream Pipeline Wiring

> **Status — Post-MVP residual [#11733](https://github.com/neomjs/neo/issues/11733).** Epic [#11720](https://github.com/neomjs/neo/issues/11720) shipped the in-repo deployment proof: the profile-structured [`ai/deploy/`](../../../ai/deploy/) compose stack, the deployed MCP healthcheck, and the [Day-0 Cloud Deployment Tutorial](./Day0Tutorial.md). This guide is the next phase — wiring that deployment into an external team's downstream CI/CD pipeline so a release can build, deploy, and redeploy the Agent OS stack without a human running `docker compose` by hand. It is a *reference integration*, not a turnkey pipeline: CI systems differ, so the moving parts are documented here and a CI-system-neutral reference script ships under [`ai/examples/cloud-deployment/deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh).

## Deployment-pipeline vs content-pipeline

Two different "pipelines" touch a cloud Agent OS deployment — keep them distinct:

| Pipeline | What it moves | Trigger | Guide |
|---|---|---|---|
| **Content pipeline** | Tenant *repo content* into the Knowledge Base | a tenant `git push` / commit | [Hook Wiring](./HookWiring.md) |
| **Deployment pipeline** | The Agent OS *containers themselves* — build, deploy, redeploy | a release tag / a protected `deploy` branch / a manual dispatch | **this guide** |

Hook Wiring is about ingesting what a tenant *writes*. This guide is about shipping the *deployment* — the `chroma` / `kb-server` / `mc-server` / `orchestrator` / `ingress` containers — when the Agent OS image or compose profile changes.

## The reference pipeline shape

A downstream deploy job runs on the deployment host (or a runner with Docker access to it) and performs a fixed sequence:

1. **Check out** the pinned Agent OS revision — a release tag, not an arbitrary commit (see *Release-gating*).
2. **Preflight** the deployment for redeploy-survivability before Docker can mutate the plane.
3. **Materialize** any host-held deployment prescriptions into the Compose environment (see *Delivering deployment prescriptions*).
4. **Build and redeploy** — recreate the containers against the *existing* persistence volumes (see *Redeploy-safe persistence*).
5. **Gate on health** — block until the deployed MCP healthchecks pass; fail the job if they do not.
6. **Report** — surface the healthcheck result and, after success, bind delivered prescriptions to the deployed revision.

[`ai/examples/cloud-deployment/deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) is a runnable reference for steps 2–6. A CI job (GitHub Actions, GitLab CI, Jenkins, …) calls it; the script is CI-system-neutral so the wiring is not locked to one vendor.

## Release-gating

Do not redeploy on every commit. The Agent OS deployment is a stateful service; a redeploy recreates containers and briefly interrupts MCP availability. Gate the deploy job on a deliberate signal:

- **Release tag** — the recommended default. The pipeline triggers on a tag (e.g. `v*`) and deploys that exact revision; the tag name becomes the deployed-version record.
- **A protected `deploy` branch** — an update to a branch that only release automation or a maintainer can advance.
- **Manual dispatch** — an operator-triggered job for controlled rollouts.

Avoid "deploy on every push to `dev`": it couples MCP availability to ordinary development cadence.

**Pass the gating signal to the deploy script — it does not infer it.** Checking out a release tag in the CI job is not enough: [`deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) resolves `NEO_REF` (default `dev`), **not** the job's checked-out ref, so a tag-triggered job that omits it deploys `dev` while its workspace sits on the tag. Hand the selector over explicitly:

```bash
# tag-triggered job: deploy the tag that fired it, not the default channel
NEO_DEPLOY_COMPOSE_FILE="<base>.yml:<overlay>.yml" \
NEO_REF="$CI_COMMIT_TAG" ai/examples/cloud-deployment/deploy-pipeline.sh
```

The script resolves that selector to a full commit id before Docker runs, and **peels annotated tags** — the tag object is never attested as the deployed revision. Substitute your CI's tag variable (`GITHUB_REF_NAME`, `CI_COMMIT_TAG`, …); for a protected-branch or manual-dispatch trigger, pass the branch or an operator-supplied SHA the same way.

## Deployed-revision provenance

Release-gating chooses *which* revision to deploy. This section is how the deployment **proves** which revision it actually runs — a separate problem, and the one that lets a stale stack look healthy.

**Resolve the channel, then pin once.** Every Neo service in [`ai/deploy/docker-compose.yml`](../../../ai/deploy/docker-compose.yml) still receives two internal build arguments — `NEO_REF` for source acquisition and `NEO_REVISION` for the OCI assertion — but Compose derives both from one operator-facing resolved pin. Resolve once, pass `NEO_REVISION` once, build once:

```bash
export NEO_REVISION=$(git ls-remote https://github.com/neomjs/neo.git dev | cut -f1)
docker compose -f ai/deploy/docker-compose.yml [--profile …] build
```

Compose maps that one full SHA to both Docker arguments for `kb-server`, `mc-server`, and `orchestrator`. The reference pipeline keeps `NEO_REF` as its pre-resolution selector input, resolves it once, then removes it before handing the canonical `NEO_REVISION` to Compose.

Left unset, the internal `NEO_REF` falls back to `dev`, and **the source stage refuses to build** (#16635). That refusal replaced the prior behaviour, which was worse than "no revision asserted": a channel name makes the fetch layer cache-stable, so an unpinned rebuild silently packaged the commit `dev` pointed at the *first* time that layer was built. `D#16304` records exactly this — a full cache hit that recreated containers from three-week-old images and moved the running revision backwards, while `redeployPreflight`, `--wait` health, and exit code zero all reported success.

**Pass the full 40-character SHA.** An abbreviated SHA is refused by the source-stage guard, before the fetch and therefore before any network access, with a message that names the freeze and the `ls-remote` resolve command. Previously it surfaced deeper, as a bare `git fetch` failure mentioning nothing about provenance — observed in a live rehearsal run against a 12-character SHA. The `git ls-remote` form above avoids the situation by construction, which is why it is the documented path rather than prose asking you to be careful.

Prefer a resolved SHA over a branch name for two independent reasons. Docker does **not** automatically invalidate a `RUN` layer when remote content changes, so re-running `build` against a mutable branch does not mechanically prove the branch was re-fetched — a changing build argument gives the cache a changing input. And a mutable channel is *policy input*, never a build identity: resolving it yourself, once, before the build is the only way the image can honestly state what it contains.

Confirm what compose will pass before building — the whole cohort must agree:

```bash
docker compose -f ai/deploy/docker-compose.yml --profile cloud config | grep -E 'NEO_REF|NEO_REVISION'
```

**Verify what the images report.** Provenance lives on three surfaces, each of which can only state a fact it actually holds. They are not interchangeable:

| Fact | Surface | Contract |
|---|---|---|
| Requested source ref | `org.neomjs.image.requested-ref` label | What the Docker source stage was *asked* to fetch — since #16635 that is the same full SHA as `NEO_REVISION`, because a mutable ref no longer builds. It still reads `dev` on a `NEO_SOURCE=local` image (which fetched nothing) or under the explicit `NEO_ALLOW_MUTABLE_REF=1` opt-in. Vendor-namespaced because no OCI standard key means "what was asked for". |
| Packaged revision | `org.opencontainers.image.revision` label | The OCI-specified source-control revision of the packaged software. Caller-supplied once via `NEO_REVISION`; **empty when not supplied**, which reads as *not asserted*. It must never contain a channel name, and the Docker build fails if it differs from `/app/.neo-revision`. Since #16635 a SHA-shaped `NEO_REF` is checked against `/app/.neo-revision` too, so a cache-served source layer fails the build even when the caller asserted nothing. |
| Resolved commit | `/app/.neo-revision` | The commit the build actually checked out, written at build time. Always populated, always true — so this is the **primary** provenance fact; the label above is its machine-readable echo when the caller resolved properly. |

```bash
docker inspect --format '{{index .Config.Labels "org.neomjs.image.requested-ref"}}' <image>
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>
docker compose -f ai/deploy/docker-compose.yml exec mc-server cat /app/.neo-revision
```

Read the requested selector against the resolved commit — the *direction* of any disagreement carries the diagnosis:

| Requested | Resolved (file) | Reading |
|---|---|---|
| a channel, e.g. `dev` | some commit | **Only reachable via the `NEO_ALLOW_MUTABLE_REF=1` exception** — an ordinary unpinned build now refuses at the source stage (#16635). Where the exception was used, the resolved commit is the sole identity and `org.opencontainers.image.revision` is empty, correctly asserting nothing. Treat the commit as *whenever that layer was last built*, not as `dev`'s current tip. |
| a pinned SHA | the same SHA | The pin held. Promote this image. |
| a pinned SHA | a **different** SHA | **Build-integrity failure.** Not an oddity — the build did not produce what was asked for. Do not promote; rebuild and investigate. |

Two rules that follow from the table. A **non-empty** `org.opencontainers.image.revision` cannot disagree with `/app/.neo-revision`: the Docker build now fails before labeling when the asserted and measured revisions differ. And a **`local-build`** marker means the image came from `NEO_SOURCE=local` (the dev-iteration escape hatch): nothing upstream was packaged, so `NEO_REVISION` must not be passed for such a build; the same integrity gate rejects that fabricated claim.

Two honest bounds. First, a missing label or missing `/app/.neo-revision` means the image predates this contract — treat it as unknown-revision, not as current. Second, these are container-local reads: they answer "which revision" but they are served from inside the deployed set, so they cannot by themselves distinguish *a failed rollout* from *a succeeded rollout whose reporter died*. Durable out-of-cohort receipts are open design work, tracked on [Discussion #15758](https://github.com/orgs/neomjs/discussions/15758).

## Redeploy-safe persistence

This is the load-bearing rule. A pipeline-driven redeploy **recreates containers**; it must **not destroy persistent state**. Sub C ([#11724](https://github.com/neomjs/neo/issues/11724)) already made the deployment redeploy-safe — the pipeline's job is to not undo it.

The deployment's persistent state (`ai/deploy/docker-compose.yml`):

| State | Mechanism | Lost when... |
|---|---|---|
| Memory Core graph + sessions — the **primary store** | `shared-sqlite-data` named volume → `/app/.neo-ai-data/sqlite` | `down -v`, or the Compose project name changes |
| Chroma vectors | `chroma-data` named volume → `/data` (the image-pinned `persist_path` from the container's `/config.yaml`; `PERSIST_DIRECTORY` is not read — ADR 0017 §2.2 amendment) | `down -v`, or the project name changes (recoverable by re-sync/re-push, at cost) |
| Sandman handoff + derived route artifacts | `shared-handoff-data` named volume → `/app/.neo-ai-data/handoff` (writer and reader share `NEO_HANDOFF_FILE_PATH`) | `down -v`, or the Compose project name changes |
| Orchestrator task, tenant-repo revision/backoff, recovery, and diagnostic state | `orchestrator-state` named volume → `/app/.neo-ai-data/orchestrator-daemon` (bound through `NEO_AI_ORCHESTRATOR_DIR`) | `down -v`, or the Compose project name changes. **The incident ledgers within it — `heal-attempts.json`, `heal-events.jsonl`, `recovery-runs/` — are now captured in the backup bundle's `ledgers/` folder and restorable (`--only-substrate ledgers`). Task state and tenant-repo revisions are not.** |
| Backup bundles | host bind-mount on the `cloud`-profile `orchestrator`, host source `NEO_HOST_BACKUP_ROOT` (default `${HOME}/.neo-ai/backups`), container target `NEO_BACKUP_PATH` → `/app/.neo-ai-data/backups` | `NEO_HOST_BACKUP_ROOT` changes between runs, or the deploying user's `$HOME` differs between runs |
| TLS certs / CA | `caddy-data` / `caddy-config` named volumes (`ingress` profile) | `down -v` (re-issued on next start — watch ACME rate limits) |
| Local model store — opt-in `local-model` profile | `local-model-data` named volume → `/root/.ollama` | `down -v`, or the project name changes (recoverable — re-pull the models) |

Three rules keep a redeploy job safe:

1. **Recreate, never wipe.** Redeploy with `docker compose up -d --build` (or `docker compose down` then `up`). Both recreate containers and keep volumes. **Never `docker compose down -v`** in a redeploy job — `-v` removes the named volumes and wipes the Memory Core primary store. `-v` belongs only in a deliberate teardown.
2. **Pin one Compose project identity.** Named volumes are identified as `<project-name>_<volume>`, and the orchestrator's constrained Docker lookup now requires the same project label. The canonical file reads `NEO_DEPLOY_PROJECT_NAME` (default `neo-agent-os`) for both its top-level `name` and `NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT`; the reference script exports that value and passes it as `--project-name`. Set the variable once and reuse it across startup, inspection, self-heal, and redeploy. Never pass a conflicting standalone `-p` / `--project-name`: a different project gets fresh volumes, while a one-sided runtime-access value makes intended services invisible.

   > **Pre-upgrade migration warning:** Before the canonical Compose file carried a top-level project name, bare `docker compose` commands derived the project from the deployment directory. In the canonical `ai/deploy` directory, that legacy project was `deploy`. Running the first post-upgrade `up` without `NEO_DEPLOY_PROJECT_NAME=deploy` selects the new `neo-agent-os` default and creates fresh `neo-agent-os_*` volumes; the existing `deploy_*` volumes remain on disk but are no longer attached. Before the first post-upgrade command, either export `NEO_DEPLOY_PROJECT_NAME=deploy` to preserve the existing namespace or deliberately migrate the old volume data into the new project. A copied deployment may have a different directory-derived legacy name, so confirm its existing project before choosing.
3. **Pin the backup host source.** The backup-bundle bind-mount takes its host source from `NEO_HOST_BACKUP_ROOT`, defaulting to `${HOME}/.neo-ai/backups`. That default is checkout-independent by design — it no longer resolves relative to the compose project directory, so a repo checked out to a different path on each run (common with ephemeral CI runners) no longer orphans prior bundles, and `git clean -x` no longer reaches them. What *can* still move it is `$HOME`: a job running as a different user, or in a container with an ephemeral home, resolves a different directory. **Set `NEO_HOST_BACKUP_ROOT` explicitly to an absolute path on persistent storage** for any unattended deployment, rather than relying on the default; or retarget backups to managed object storage. This is placement only — it does not put bundles on a different physical filesystem from the graph, and it is not a substitute for off-site copy.

Off-site copy is the disaster-recovery layer *above* redeploy-safety:
redeploy-safety keeps named-volume state across a container *recreate*, while
host-loss recovery requires exporting every load-bearing named volume.

The bundle now covers the **incident ledgers** inside `orchestrator-state` —
`heal-attempts.json`, `heal-events.jsonl`, and `recovery-runs/` land in the
bundle's `ledgers/` folder and restore with `--only-substrate ledgers`. That
closes a specific hole: the self-heal and recovery record used to be destroyed by
the same operation whose cause it existed to explain, so the one class of event
post-mortem capability most needed to describe was the one it never could.

It does **not** cover the rest of the volume. Orchestrator task state and
tenant-repo revision/backoff state are still bundle-absent, so copy or export
`orchestrator-state` separately before claiming *those* are off-host backed up.
The distinction matters: "the ledgers survive" is not "the volume survives", and
treating the narrower guarantee as the broader one is how an operator discovers
the gap during a recovery rather than before one.

**Verification:** the redeploy-survival check is [Day-0 Tutorial Milestone 7](./Day0Tutorial.md) — a `docker compose down && docker compose up --build` cycle, then confirm the Memory Core store, Sandman handoff, orchestrator task/revision state, and backup bundles are intact. Run that check once when the pipeline is first wired; subsequent redeploys rely on the named-volume + project-name + bind-mount contract above.

## Delivering deployment prescriptions

Some recovery knobs only take effect when Compose creates a container. A diagnosis can identify that such a knob is relevant, but it does **not** choose a value or authorize a deployment change. The first producer is an explicit trusted host/operator action; the pipeline's narrower job is to validate and deliver that prescription without letting an append-only file become configuration authority.

The reference script keeps this state outside the checkout under `NEO_HOST_DEPLOYMENT_PRESCRIPTION_ROOT`, which defaults to `${HOME}/.neo-ai/deployment-prescriptions`. `prescriptions.jsonl` is the append sink, while `active.env` is the persistent carrier Compose consumes. The deployment project's `.env` points to that carrier. Adopting an existing regular `.env` is explicit: unrelated variables, comments, and other operator-owned content are preserved before the project path is replaced by the carrier symlink. This keeps a later checkout or redeploy from silently reverting the delivered values.

Materialization runs after the redeploy-survivability preflight and before `docker compose up`. Every candidate is revalidated against the current recovery-knob registry **and fresh runtime context from the exact Compose target**; a formerly valid raise cannot become a lowering instruction after the live ceiling moves. Equality is treated separately as an already-applied desired state, so the first successful raise does not brick later redeploys; the actuator's strict raise-only admission remains unchanged. An invalid or conflicted active prescription, a missing/ambiguous target, or an unreadable live bound aborts before Docker mutates the plane instead of falling back to a stale carrier. With no active prescription, deployment-owned entries are removed and Compose retains its declared defaults.

The reference pipeline pins `active.env` explicitly on every Compose call and refuses when a deployment-owned key is already exported in the runner environment: exported values outrank env files, so accepting one would let the receipt describe a value Compose did not consume. One atomic host deploy lock covers materialization through the health gate. Each run also gets a UUID-bound state manifest and receipt path, so even an out-of-band materialization cannot make deployment A receipt deployment B's snapshot.

Only after `docker compose up --wait` has passed its health gate does the pipeline atomically write that run's delivery receipt. The receipt binds the deployment-run UUID, `deployedRevision`, the materialized carrier digest, and the active prescription IDs. It proves which prescription set the successful deployment path delivered; it does **not** claim that a runtime observer independently read back each resulting process value.

## The health gate

A redeploy is not "done" when `docker compose up` returns — it is done when the MCP servers report healthy. The compose file already declares Docker healthchecks (`mcpHealthcheck.mjs` over `/mcp`); a deploy job should gate on them so a broken deploy fails loudly:

- `docker compose ... up -d --build --wait` blocks until every service with a healthcheck is healthy and exits non-zero if one does not — the simplest gate, used by the reference script.
- Or poll `docker compose ps` / the healthcheck CLI (`npm run ai:mcp-healthcheck`) and fail the job on a non-healthy result.

A deploy job that does not gate on health reports success while serving a broken stack. See [Deployment Cookbook §8](../DeploymentCookbook.md) for the healthcheck/readiness contract.

## Targeting a real plane: a compose-file list, not a path

The script is CI-neutral: it is meant to be invoked by a deployment's own job, and this repository contains no in-repo caller for it (no npm target, no CI job). That bounds what can be said here — it says nothing about how any particular deployment has been redeployed in practice.

What *is* verifiable is a capability gap: until the change below, **no correct invocation against a multi-file plane existed at all.**

`NEO_DEPLOY_COMPOSE_FILE` is mandatory. It accepts a `:`-delimited list (Docker's own `COMPOSE_FILE` convention) and expands to repeated `-f` in merge order — later files override earlier ones, so reordering them changes the result. A single explicit path behaves exactly as before. An unset, empty, or delimiter-only value aborts before revision resolution, preflight, or Docker.

This is not a convenience. A real plane is rarely one file — the canonical local Agent OS runs `docker-compose.yml` plus `docker-compose.local-agent-os.yml` under project `neo-local-agent-os` — and a single `-f` drops the overlay **silently**. Measured read-only on that plane, the two renderings differ by 80 lines: without the overlay, `NEO_AUTH_MODE` is absent, `NEO_MODEL_PROVIDER` is empty rather than `openAiCompatible`, and `NEO_MCP_HEALTHCHECK_TOKEN_FILE` is gone — under a *different* project name, so on fresh volumes. The reference pipeline therefore has no base-only fallback: a caller must name the complete deployment composition it intends to operate.

So a caller must pass three things, and the script infers none of them:

```bash
NEO_DEPLOY_PROJECT_NAME=<project> \
NEO_DEPLOY_COMPOSE_FILE="<base>.yml:<overlay>.yml" \
NEO_REF=$(git ls-remote https://github.com/neomjs/neo.git dev | cut -f1) \
  ai/examples/cloud-deployment/deploy-pipeline.sh
```

**Discover those values rather than hardcoding them.** A running plane already records its own identity in `com.docker.compose.project` and `com.docker.compose.project.config_files` on every container, and the deploy home may be a checkout other than the one the caller runs from — so reading the labels is both less brittle and the only way to be certain which plane is being addressed.

Confirming delivery is a separate step from the health gate: `up --wait` proves the containers are up, not that they carry the intended code. Compare each member's `/app/.neo-revision` against the pinned revision for that.

## Failure signatures

| Signature | Likely cause | Pipeline response |
|---|---|---|
| Healthcheck never goes healthy after redeploy | image build broken, a required env var unset, or Chroma unreachable | fail the job; surface `docker compose logs`; the prior volumes are intact for a retry |
| Memory Core store empty after redeploy | the job ran `docker compose down -v`, or changed `NEO_DEPLOY_PROJECT_NAME` | never `-v`; restore the stable project variable — the old volume still holds the data, reattach it |
| Tenant-repo revisions or orchestrator task history reset after redeploy | `orchestrator-state` is absent/replaced, or `NEO_AI_ORCHESTRATOR_DIR` does not match its mount target | reattach the stable volume and keep the env, mount, and healthcheck on `/app/.neo-ai-data/orchestrator-daemon` |
| Runtime diagnostics report project/service lookup failure | a command used a conflicting standalone `-p`, or the deployment project variable changed | use one stable `NEO_DEPLOY_PROJECT_NAME` for Compose labels, volumes, inspection, and redeploy; do not override only one side |
| `get_sandman_handoff` returns `handoff-not-found` after a successful cycle | writer and reader do not share `NEO_HANDOFF_FILE_PATH`, or `shared-handoff-data` was replaced | inspect both service env/mounts; reattach the stable named volume; never repair this by KB-ingesting the handoff |
| Backup bundles missing after redeploy | `NEO_HOST_BACKUP_ROOT` changed, or it was left at its `${HOME}`-derived default and the job ran as a different user | set `NEO_HOST_BACKUP_ROOT` to a fixed absolute path on persistent storage; recover bundles from the prior host directory. Bundles from before the relocation may still sit at the old in-tree `.neo-ai-data/backups` — the backup CLI emits a one-time notice naming that path and never moves them |
| TLS cert re-issued / ACME rate-limited each deploy | `caddy-data` removed by `down -v` | stop using `-v` so the issued certs persist |

## Repairing a plane that is already behind

Everything above describes a pipeline running *forward* from a known-good state. A plane that has drifted needs the opposite: the pipeline has to be *pointed at* a deployment nobody is currently maintaining, and the reason a rebuild alone does not fix it is a configuration contract, not a revision gap.

The worked case is the orchestrator's authority role. Its config leaf carries **no default** — requiredness is armed by that emptiness — so a plane that never declares `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE` produces a *refused launch* that writes no state directory, no PID file and no log. Rebuilding it at a newer revision reproduces the refusal at a newer revision. There are thirteen such required inputs.

[`ai/scripts/maintenance/migrateDeployment.mjs`](../../../ai/scripts/maintenance/migrateDeployment.mjs) is the supervised bootstrap for that case. It is operator-invoked, never scheduled, and never mutates on its own judgement:

```bash
# What would change, and why apply is refused. Mutates nothing.
node ai/scripts/maintenance/migrateDeployment.mjs plan --project <compose-project>

# Repair a missing or empty required input, then apply. Repeatable per service.
node ai/scripts/maintenance/migrateDeployment.mjs apply \
  --project <compose-project> \
  --set orchestrator.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=container-plane
```

Four properties are worth knowing before running it, because each was a defect first.

**It refuses by default, and it refuses per service.** The census classifies keys per *profile*, but a profile's required list is not uniform across its services: on the canonical profile four of the thirteen required inputs are declared by one service only. Observations are therefore kept per service and never unioned — a union only ever shrinks the delta, so a key set on one container and absent from another would report as satisfied for both. Anything the tool could not establish blocks rather than annotating an authorizing verdict.

**The config cohort is wider than the revision cohort.** `/app/.neo-revision` is written by the Neo image, so only Neo services can produce a revision receipt. But the deployment contract spans services that cannot: Compose owns `NEO_DEPLOY_HOSTNAME` on the ingress service. Both cohorts are derived — the config cohort from the plane's own Compose service labels, never a hardcoded list — so a deployment with a differently-named proxy stays inside the contract.

**`--set` reaches the containers through a Compose overlay fragment, not through the pipeline's environment.** The profile declares its env as *literals* (`NEO_CHROMA_HOST=chroma`), not `${VAR}`, so exporting a value into the pipeline's environment changes nothing that the containers consume. The bootstrap generates a per-service fragment and appends it **last** in the compose-file list, where merge order makes it win. This is why the pipeline accepting an *ordered* `NEO_DEPLOY_COMPOSE_FILE` list matters: a single-`-f` caller cannot express a repair at all.

**Values the plane already carries are preserved.** `NEO_DEPLOY_HOSTNAME` is supplied by interpolation (`${NEO_DEPLOY_HOSTNAME:-localhost}`) rather than stored, so a repair run whose environment lacks it would re-render the *fallback* and silently reset a plane that had a real hostname. Compose-owned observed values are carried forward, with an explicit `--set` for the same key taking precedence.

Two bounds, stated because they are real. Compose-owned obligation is read from observed env, so it cannot detect a compose-owned key Compose *forgot* to set. And the compose file paths are discovered from the plane's own labels, which on a multi-clone host may point outside the checkout running the tool.

## Out of scope

- **Cadence, kill-switch and unattended activation.** The bootstrap above is supervised and one-shot by design; it must not become a resident updater. The unattended path is a separate authority.
- The MVP backup/persistence *implementation* — owned by Sub C [#11724](https://github.com/neomjs/neo/issues/11724); this guide documents how a pipeline *preserves* it.
- A turnkey, vendor-specific CI workflow — CI systems differ; this guide plus the reference script are the CI-neutral substrate a team adapts.
- Multi-instance / blue-green / zero-downtime deploy topologies — a later evolution; the reference shape is single-instance recreate-in-place.

## Related

- [Deployment Cookbook](../DeploymentCookbook.md) — the deployment authority: topology, profiles, persistence (§5), healthcheck contract (§8).
- [Day-0 Cloud Deployment Tutorial](./Day0Tutorial.md) — the first-run path; Milestone 7 is the redeploy-survival check this pipeline automates.
- [Hook Wiring](./HookWiring.md) — the *content* pipeline (tenant repo content into the KB), distinct from this *deployment* pipeline.
- [`ai/examples/cloud-deployment/deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) — the runnable, CI-neutral reference deploy/redeploy script.
- [`ai/scripts/maintenance/migrateDeployment.mjs`](../../../ai/scripts/maintenance/migrateDeployment.mjs) — the supervised `plan`/`apply` bootstrap for a plane that is already behind.
- [ADR 0014](../decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md) — the cloud topology + scheduler taxonomy this deployment implements.
