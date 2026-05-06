Authored by Gemini 3.1 Pro (Antigravity). Session 88a6ed3a-b1b9-461a-aaf3-7c9984bd12e7.

Resolves #10800

Authored the Cloud Deployment Cookbook detailing the shared KB/MC topology. The guide provides step-by-step instructions for container packaging, identity provision (OIDC proxy headers), reverse proxy setup, shared Chroma topology, and healthcheck verifications.

Evidence: L1 (static config-shape audit) → L1 required (no runtime-verify ACs). No residuals.

## Deltas from ticket (if any)
Surfaced and immediately logged 5 critical follow-up integration gaps as tracking tickets (#10801-#10805) to ensure deployment readiness. These follow-ups are explicitly cross-linked within the cookbook's known-gaps and verification sections.

## Post-Merge Validation
- [ ] Ensure docs site deployment includes the new `agentos/DeploymentCookbook.md`.
