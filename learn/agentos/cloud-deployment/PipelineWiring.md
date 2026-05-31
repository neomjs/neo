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

## Redeploy-safe persistence

This is the load-bearing rule. A pipeline-driven redeploy **recreates containers**; it must **not destroy persistent state**. Sub C ([#11724](https://github.com/neomjs/neo/issues/11724)) already made the deployment redeploy-safe — the pipeline's job is to not undo it.

The deployment's persistent state (`ai/deploy/docker-compose.yml`):

| State | Mechanism | Lost when... |
|---|---|---|
| Memory Core graph + sessions — the **primary store** | `shared-sqlite-data` named volume → `/app/.neo-ai-data/sqlite` | `down -v`, or the Compose project name changes |
| Chroma vectors | `chroma-data` named volume → `/chroma/unified` (set via `PERSIST_DIRECTORY`) | `down -v`, or the project name changes (recoverable by re-sync/re-push, at cost) |
| Backup bundles | host bind-mount `./.neo-ai-data/backups` on the `cloud`-profile `orchestrator` | the compose file's host location changes between runs |
| TLS certs / CA | `caddy-data` / `caddy-config` named volumes (`ingress` profile) | `down -v` (re-issued on next start — watch ACME rate limits) |
| Local model store — opt-in `local-model` profile | `local-model-data` named volume → `/root/.ollama` | `down -v`, or the project name changes (recoverable — re-pull the models) |

Three rules keep a redeploy job safe:

1. **Recreate, never wipe.** Redeploy with `docker compose up -d --build` (or `docker compose down` then `up`). Both recreate containers and keep volumes. **Never `docker compose down -v`** in a redeploy job — `-v` removes the named volumes and wipes the Memory Core primary store. `-v` belongs only in a deliberate teardown.
2. **Pin the Compose project name.** Named volumes are identified as `<project-name>_<volume>`. The project name defaults to the compose-file directory's basename (`deploy`). A redeploy run with a different `--project-name` (or after the compose file moves) gets *fresh, empty* volumes — the old data is intact but unreferenced. Pass an explicit, stable `--project-name` (the reference script pins one) so every redeploy reattaches the same volumes.
3. **Deploy from a stable host location.** The backup-bundle bind-mount `./.neo-ai-data/backups` resolves relative to the compose file's project directory. If the deployment repo is checked out to a different host path on each run — common with ephemeral CI runners — the bind-mount points at a different host directory each time and prior bundles are orphaned. Deploy from a **persistent checkout location** on the deployment host, not an ephemeral per-run runner workspace; or retarget backups to an absolute host path / managed object storage.

Off-site copy of the backup bundles is the disaster-recovery layer *above* redeploy-safety: redeploy-safety keeps state across a container *recreate*; backups plus off-site copy cover host loss.

**Verification:** the redeploy-survival check is [Day-0 Tutorial Milestone 7](./Day0Tutorial.md) — a `docker compose down && docker compose up --build` cycle, then confirm the Memory Core store and backup bundles are intact. Run that check once when the pipeline is first wired; subsequent redeploys rely on the named-volume + project-name + bind-mount contract above.

## The health gate

A redeploy is not "done" when `docker compose up` returns — it is done when the MCP servers report healthy. The compose file already declares Docker healthchecks (`mcpHealthcheck.mjs` over `/mcp`); a deploy job should gate on them so a broken deploy fails loudly:

- `docker compose ... up -d --build --wait` blocks until every service with a healthcheck is healthy and exits non-zero if one does not — the simplest gate, used by the reference script.
- Or poll `docker compose ps` / the healthcheck CLI (`npm run ai:mcp-healthcheck`) and fail the job on a non-healthy result.

A deploy job that does not gate on health reports success while serving a broken stack. See [Deployment Cookbook §8](../DeploymentCookbook.md) for the healthcheck/readiness contract.

## Failure signatures

| Signature | Likely cause | Pipeline response |
|---|---|---|
| Healthcheck never goes healthy after redeploy | image build broken, a required env var unset, or Chroma unreachable | fail the job; surface `docker compose logs`; the prior volumes are intact for a retry |
| Memory Core store empty after redeploy | the job ran `docker compose down -v`, or redeployed under a different `--project-name` | never `-v`; pin `--project-name` — the old volume still holds the data, reattach it |
| Backup bundles missing after redeploy | redeployed from a different host checkout location (relative bind-mount) | deploy from a stable checkout path; recover bundles from the prior host directory |
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
