# Cloud-Native KB Ingestion — Worked Examples

Runnable companions to the [`cloud-deployment/`](../../learn/agentos/cloud-deployment/Overview.md)
guide tree (Epic #11624 — Cloud-Native KB Ingestion).

| Artifact | Demonstrates |
|---|---|
| [`minimal-external-workspace/`](./minimal-external-workspace/) | An external tenant workspace with a custom Source + custom Parser for a non-Neo file format (`.proto`). |
| [`pre-push-hook.sh`](./pre-push-hook.sh) | A git `pre-push` hook that streams a push's changed files into the KB through the `ai:ingest-tenant` bulk facade. |

These are *minimal* demonstrations of the ingestion contracts, not production
deployments. Read [Overview](../../learn/agentos/cloud-deployment/Overview.md) first,
then [Tenant Ingestion Model](../../learn/agentos/cloud-deployment/TenantIngestionModel.md)
for the operational repo-identity, credential-boundary, and source-family inventory rules before
each artifact's own README / header comment.
