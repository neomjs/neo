#!/usr/bin/env bash
#
# deploy-pipeline.sh — reference downstream deploy/redeploy job for the cloud
# Agent OS stack (post-MVP residual #11733).
#
# A CI job (GitHub Actions / GitLab CI / Jenkins / ...) calls this on the
# deployment host. It is intentionally CI-system-neutral — the wiring is the
# reference, not the CI vendor.
#
# Usage:    ai/examples/cloud-deployment/deploy-pipeline.sh [compose-profile ...]
#           NEO_DEPLOY_PROFILES="cloud ingress" ai/examples/cloud-deployment/deploy-pipeline.sh
# Contract: learn/agentos/cloud-deployment/PipelineWiring.md
#
# Redeploy-safe: recreates containers and KEEPS persistent state. It never runs
# `docker compose down -v` (that wipes the Memory Core primary store) and pins
# an explicit `--project-name` so every redeploy reattaches the same volumes.
#
set -euo pipefail

# Resolve the compose file from this script's location so the deployment is not
# tied to the caller's working directory. Deploy from a STABLE host checkout —
# the backup-bundle bind-mount is a relative path; see PipelineWiring.md.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${NEO_DEPLOY_COMPOSE_FILE:-$SCRIPT_DIR/../../ai/deploy/docker-compose.yml}"

# A stable project name pins named-volume identity across redeploys. Export the
# same value consumed by docker-compose.yml for its top-level project name and
# the orchestrator runtime-access target identity.
PROJECT_NAME="${NEO_DEPLOY_PROJECT_NAME:-neo-agent-os}"
export NEO_DEPLOY_PROJECT_NAME="$PROJECT_NAME"

# Profiles to deploy. Default: the full cloud stack + ingress. Override by
# passing profile names as arguments, or via NEO_DEPLOY_PROFILES.
profile_args=()
if [ "$#" -gt 0 ]; then
    for p in "$@"; do profile_args+=(--profile "$p"); done
else
    for p in ${NEO_DEPLOY_PROFILES:-cloud ingress}; do profile_args+=(--profile "$p"); done
fi

compose() { docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "${profile_args[@]}" "$@"; }

echo "[deploy] revision: $(git -C "$SCRIPT_DIR" describe --tags --always 2>/dev/null || echo unknown)"
echo "[deploy] compose:  $COMPOSE_FILE"
echo "[deploy] project:  $PROJECT_NAME"
echo "[deploy] profiles: ${profile_args[*]}"

# Build + recreate containers, KEEPING named volumes and the backup bind-mount.
# `--wait` blocks until every service with a healthcheck reports healthy and
# exits non-zero if one does not — this is the deploy health gate. `set -e`
# then fails the job, so a broken redeploy is never reported as success.
compose up -d --build --wait

echo "[deploy] all services healthy — redeploy complete"
compose ps
