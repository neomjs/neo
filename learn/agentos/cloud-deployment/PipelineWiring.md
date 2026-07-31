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
2. **Build** the images — `docker compose -f ai/deploy/docker-compose.yml [--profile …] build`.
3. **Redeploy** — recreate the containers against the *existing* persistence volumes (see *Redeploy-safe persistence*).
4. **Gate on health** — block until the deployed MCP healthchecks pass; fail the job if they do not.
5. **Report** — surface the healthcheck result so a failed deploy is visible.

[`ai/examples/cloud-deployment/deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) is a runnable reference for steps 2–5. A CI job (GitHub Actions, GitLab CI, Jenkins, …) calls it; the script is CI-system-neutral so the wiring is not locked to one vendor.

## Release-gating

Do not redeploy on every commit. The Agent OS deployment is a stateful service; a redeploy recreates containers and briefly interrupts MCP availability. Gate the deploy job on a deliberate signal:

- **Release tag** — the recommended default. The pipeline triggers on a tag (e.g. `v*`) and deploys that exact revision; the tag name becomes the deployed-version record.
- **A protected `deploy` branch** — an update to a branch that only release automation or a maintainer can advance.
- **Manual dispatch** — an operator-triggered job for controlled rollouts.

Avoid "deploy on every push to `dev`": it couples MCP availability to ordinary development cadence.

**Pass the gating signal to the deploy script — it does not infer it.** Checking out a release tag in the CI job is not enough: [`deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) resolves `NEO_REF` (default `dev`), **not** the job's checked-out ref, so a tag-triggered job that omits it deploys `dev` while its workspace sits on the tag. Hand the selector over explicitly:

```bash
# tag-triggered job: deploy the tag that fired it, not the default channel
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

Left unset, the internal `NEO_REF` defaults to `dev` and `NEO_REVISION` stays empty — the pre-existing behaviour, with no revision asserted.

**Pass the full 40-character SHA.** An abbreviated SHA fails closed at `git fetch`, before any checkout — correct behaviour, since an abbreviated ref is not a reproducible pin, but the error surfaces as a fetch failure rather than as anything mentioning provenance. Observed in a live rehearsal run against a 12-character SHA. The `git ls-remote` form above avoids this by construction, which is why it is the documented path rather than prose asking you to be careful.

Prefer a resolved SHA over a branch name for two independent reasons. Docker does **not** automatically invalidate a `RUN` layer when remote content changes, so re-running `build` against a mutable branch does not mechanically prove the branch was re-fetched — a changing build argument gives the cache a changing input. And a mutable channel is *policy input*, never a build identity: resolving it yourself, once, before the build is the only way the image can honestly state what it contains.

Confirm what compose will pass before building — the whole cohort must agree:

```bash
docker compose -f ai/deploy/docker-compose.yml --profile cloud config | grep -E 'NEO_REF|NEO_REVISION'
```

**Verify what the images report.** Provenance lives on three surfaces, each of which can only state a fact it actually holds. They are not interchangeable:

| Fact | Surface | Contract |
|---|---|---|
| Requested source ref | `org.neomjs.image.requested-ref` label | What the Docker source stage was *asked* to fetch: `dev` on the unpinned path, or the same full SHA as `NEO_REVISION` on the pinned path. Vendor-namespaced because no OCI standard key means "what was asked for". |
| Packaged revision | `org.opencontainers.image.revision` label | The OCI-specified source-control revision of the packaged software. Caller-supplied once via `NEO_REVISION`; **empty when not supplied**, which reads as *not asserted*. It must never contain a channel name, and the Docker build fails if it differs from `/app/.neo-revision`. |
| Resolved commit | `/app/.neo-revision` | The commit the build actually checked out, written at build time. Always populated, always true — so this is the **primary** provenance fact; the label above is its machine-readable echo when the caller resolved properly. |

```bash
docker inspect --format '{{index .Config.Labels "org.neomjs.image.requested-ref"}}' <image>
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>
docker compose -f ai/deploy/docker-compose.yml exec mc-server cat /app/.neo-revision
```

Read the requested selector against the resolved commit — the *direction* of any disagreement carries the diagnosis:

| Requested | Resolved (file) | Reading |
|---|---|---|
| a channel, e.g. `dev` | some commit | Expected. No pin was given, so the resolved commit is the sole identity — and `org.opencontainers.image.revision` will be empty, correctly asserting nothing. |
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
| Chroma vectors | `chroma-data` named volume → `/chroma/unified` (set via `PERSIST_DIRECTORY`) | `down -v`, or the project name changes (recoverable by re-sync/re-push, at cost) |
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

## The health gate

A redeploy is not "done" when `docker compose up` returns — it is done when the MCP servers report healthy. The compose file already declares Docker healthchecks (`mcpHealthcheck.mjs` over `/mcp`); a deploy job should gate on them so a broken deploy fails loudly:

- `docker compose ... up -d --build --wait` blocks until every service with a healthcheck is healthy and exits non-zero if one does not — the simplest gate, used by the reference script.
- Or poll `docker compose ps` / the healthcheck CLI (`npm run ai:mcp-healthcheck`) and fail the job on a non-healthy result.

A deploy job that does not gate on health reports success while serving a broken stack. See [Deployment Cookbook §8](../DeploymentCookbook.md) for the healthcheck/readiness contract.

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

## Out of scope

- The MVP backup/persistence *implementation* — owned by Sub C [#11724](https://github.com/neomjs/neo/issues/11724); this guide documents how a pipeline *preserves* it.
- A turnkey, vendor-specific CI workflow — CI systems differ; this guide plus the reference script are the CI-neutral substrate a team adapts.
- Multi-instance / blue-green / zero-downtime deploy topologies — a later evolution; the reference shape is single-instance recreate-in-place.

## Related

- [Deployment Cookbook](../DeploymentCookbook.md) — the deployment authority: topology, profiles, persistence (§5), healthcheck contract (§8).
- [Day-0 Cloud Deployment Tutorial](./Day0Tutorial.md) — the first-run path; Milestone 7 is the redeploy-survival check this pipeline automates.
- [Hook Wiring](./HookWiring.md) — the *content* pipeline (tenant repo content into the KB), distinct from this *deployment* pipeline.
- [`ai/examples/cloud-deployment/deploy-pipeline.sh`](../../../ai/examples/cloud-deployment/deploy-pipeline.sh) — the runnable, CI-neutral reference deploy/redeploy script.
- [ADR 0014](../decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md) — the cloud topology + scheduler taxonomy this deployment implements.
