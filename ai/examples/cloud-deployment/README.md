# Cloud-Native KB Ingestion — Worked Examples

Runnable companions to the [`cloud-deployment/`](../../learn/agentos/cloud-deployment/Overview.md)
guide tree (Epic #11624 — Cloud-Native KB Ingestion).

| Artifact | Demonstrates |
|---|---|
| [`minimal-external-workspace/`](./minimal-external-workspace/) | An external tenant workspace with a custom Source + custom Parser for a non-Neo file format (`.proto`). |
| [`pre-push-hook.sh`](./pre-push-hook.sh) | A git `pre-push` hook that streams a push's changed files through `ai:kb-push-client` when `NEO_KB_MCP_URL` is configured, with the local `ai:ingest-tenant` bulk facade as fallback. |
| [`deploy-pipeline.sh`](./deploy-pipeline.sh) | A CI-neutral downstream deploy/redeploy job for the Agent OS compose stack — build, redeploy-safe container recreate, and a `--wait` health gate. Contract: [Pipeline Wiring](../../learn/agentos/cloud-deployment/PipelineWiring.md). |

These are *minimal* demonstrations of the ingestion and deployment contracts, not production
deployments. Read [Overview](../../learn/agentos/cloud-deployment/Overview.md) first,
then [Tenant Ingestion Model](../../learn/agentos/cloud-deployment/TenantIngestionModel.md)
for the operational repo-identity, credential-boundary, and source-family inventory rules before
each artifact's own README / header comment.
For a linear first-run path that uses these pieces in order, follow the
[Day-0 Cloud Deployment Tutorial](../../learn/agentos/cloud-deployment/Day0Tutorial.md).
