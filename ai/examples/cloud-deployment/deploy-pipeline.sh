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
# `$SCRIPT_DIR` is `ai/examples/cloud-deployment`, so `../..` is ALREADY `ai/` — re-adding `ai/`
# here produced `ai/ai/deploy/...`, a path that has never existed. It went unnoticed because the
# spec fakes `docker`, and a fake docker ignores `-f`, so a wrong compose path could not fail a
# test. Any operator who did not set NEO_DEPLOY_COMPOSE_FILE was relying on a broken default.
COMPOSE_FILE="${NEO_DEPLOY_COMPOSE_FILE:-$SCRIPT_DIR/../../deploy/docker-compose.yml}"

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

# Resolve the deployed revision BEFORE Docker runs (#15792). Every run pins:
# there is deliberately no unpinned path, because this is the reference pipeline
# and its default is what propagates to every downstream deployment.
#
# BOTH args are exported, not just NEO_REVISION. NEO_REVISION only feeds the OCI
# revision LABEL; the source stage fetches ${NEO_REF}. Exporting only NEO_REVISION
# would stamp a resolved SHA onto an image whose source stage fetched a mutable
# channel — a label asserting a fact the artifact does not hold, and the cache
# input would not change, so `--build` might not even re-fetch.
NEO_SELECTOR="${NEO_REF:-dev}"
NEO_REPO_URL="${NEO_REPO_URL:-https://github.com/neomjs/neo.git}"

if [[ "$NEO_SELECTOR" =~ ^[0-9a-f]{40}$ ]]; then
    # A 40-hex string is an OBJECT id — NOT necessarily a commit, and not necessarily
    # present on the remote at all. Trusting its shape was the last hiding place of the
    # original defect: an annotated-TAG object id is 40 hex, and the Dockerfile's
    # `git fetch …; git checkout --detach FETCH_HEAD; git rev-parse HEAD` peels it to the
    # commit — so the label would attest the tag object while /app/.neo-revision records
    # the commit. A nonexistent 40-hex id would likewise sail past the fail-before-Docker
    # contract and only break inside the build.
    #
    # So prove it against the remote with the SAME sequence the Dockerfile runs, and export
    # what that sequence resolves to. `^{commit}` both asserts commit-ness and performs the
    # peel; a tag object resolves to its commit, a tree or blob fails, and an absent id fails
    # at fetch. Shallow + a throwaway dir keeps it cheap; the pipeline already hits the network.
    probe_dir="$(mktemp -d)"
    trap 'rm -rf "$probe_dir"' EXIT INT TERM

    if ! git -C "$probe_dir" init --quiet >/dev/null 2>&1 \
       || ! git -C "$probe_dir" fetch --quiet --depth=1 "$NEO_REPO_URL" "$NEO_SELECTOR" >/dev/null 2>&1; then
        echo "[deploy] FATAL: 40-char id '${NEO_SELECTOR}' could not be fetched from ${NEO_REPO_URL}." >&2
        echo "[deploy] It is absent, unreachable, or the remote refuses by-id fetches. Docker was NOT invoked." >&2
        exit 1
    fi

    resolved_revision="$(git -C "$probe_dir" rev-parse --verify --quiet 'FETCH_HEAD^{commit}' 2>/dev/null || true)"

    if [ -z "$resolved_revision" ]; then
        echo "[deploy] FATAL: 40-char id '${NEO_SELECTOR}' is not a commit and has no commit to peel to." >&2
        echo "[deploy] Pass a commit id or an annotated tag name. Docker was NOT invoked." >&2
        exit 1
    fi

    if [ "$resolved_revision" != "$NEO_SELECTOR" ]; then
        # The selector was a tag object (or otherwise peelable). Say so: the operator asked for
        # one id and the images will carry another, and a silent substitution here is the exact
        # provenance lie this ticket exists to remove.
        echo "[deploy] note: '${NEO_SELECTOR}' peeled to commit ${resolved_revision} — the commit is what gets built and attested." >&2
    fi
else
    # A channel/tag, or an abbreviated SHA (which `git fetch` would reject anyway
    # — see PipelineWiring.md). Resolve it to exactly one full COMMIT id or abort.
    #
    # An ANNOTATED tag advertises two lines: the tag object at `refs/tags/X` and the
    # peeled commit at `refs/tags/X^{}`. Docker checks out the peeled commit, so the
    # tag-object id would make NEO_REVISION disagree with /app/.neo-revision — the
    # label attesting an object that is not the deployed source. A 40-char git object
    # id is not necessarily a COMMIT id. Prefer the peel; never the tag object.
    # BOTH patterns, and this is load-bearing: an EXACT pattern never elicits the peel.
    # Verified against a disposable annotated-tag repo — `ls-remote <url> v9.9.9` returns
    # only `refs/tags/v9.9.9` (the tag object); `ls-remote <url> v9.9.9 'v9.9.9^{}'` also
    # returns `refs/tags/v9.9.9^{}` (the commit). A `refs/tags/<sel>*` glob would work too
    # but can over-match (`v9.9.9-rc1`), turning one tag into a false ambiguity abort.
    ls_remote="$(git ls-remote "$NEO_REPO_URL" "$NEO_SELECTOR" "${NEO_SELECTOR}^{}" 2>/dev/null || true)"
    # Ambiguity is decided on the NON-PEEL refs, never after peeling. A selector can match
    # BOTH a branch and an annotated tag (`refs/heads/X` + `refs/tags/X` + `refs/tags/X^{}`)
    # — git itself treats that as ambiguous. Preferring the peel first would collapse three
    # lines to one and silently deploy the tag while ignoring the branch, bypassing this abort.
    plain_refs="$(printf '%s\n' "$ls_remote" | awk '$2 != "" && $2 !~ /\^\{\}$/ {print $2}')"
    match_count="$(printf '%s' "$plain_refs" | grep -c . || true)"

    if [ "$match_count" -eq 1 ]; then
        # Exactly one ref matched. Resolve it to a COMMIT: an annotated tag contributes a
        # `^{}` peel, everything else already points at a commit.
        peeled="$(printf '%s\n' "$ls_remote" | awk -v r="$plain_refs" '$2 == r "^{}" {print $1}')"

        if [ -n "$peeled" ]; then
            matches="$peeled"
        else
            matches="$(printf '%s\n' "$ls_remote" | awk -v r="$plain_refs" '$2 == r {print $1}')"
        fi
    fi

    if [ "$match_count" -ne 1 ]; then
        echo "[deploy] FATAL: selector '${NEO_SELECTOR}' matched ${match_count} refs at ${NEO_REPO_URL}; expected exactly 1." >&2
        echo "[deploy] Pass a full 40-character commit SHA, or a selector naming exactly one ref. Docker was NOT invoked." >&2
        exit 1
    fi
    resolved_revision="$matches"
fi

export NEO_REF="$resolved_revision"
export NEO_REVISION="$resolved_revision"

echo "[deploy] selector:     $NEO_SELECTOR"
echo "[deploy] revision:     $resolved_revision   <- built into the images"
echo "[deploy] host-checkout: $(git -C "$SCRIPT_DIR" describe --tags --always 2>/dev/null || echo unknown)   (this host only; NOT what is deployed)"
echo "[deploy] compose:  $COMPOSE_FILE"
echo "[deploy] project:  $PROJECT_NAME"
echo "[deploy] profiles: ${profile_args[*]}"

# SURVIVABILITY GATE — runs BEFORE anything touches containers.
#
# Refuses unless a verified, non-empty, restorable pre-transition bundle exists. `up -d --build`
# recreates containers, and a redeploy that crosses into an unrecoverable plane is exactly the
# failure this guards: a deployment lost its Memory Core corpus, and the only bundle in its ledger
# completed 25 minutes AFTER the new stack came up, capturing an already-empty plane.
#
# On a GENUINE first install there is no bundle yet and nothing to protect, so pass --initialize:
#
#     NEO_DEPLOY_INITIALIZE=1 ai/examples/cloud-deployment/deploy-pipeline.sh
#
# That is an explicit declaration on purpose. A first deployment and a plane that was destroyed or
# relocated both present as ABSENCE, and no heuristic separates them — so refusing on absence alone
# would block the first legitimate deploy, while proceeding on absence is how the incident happened.
# The gate records a marker beside the bundles (on the bind-mount `down -v` does not touch), so a
# later absence is informative rather than ambiguous. --initialize on an already-initialized host is
# REFUSED: the escape hatch must not become the bypass.
#
# Scope, stated honestly: this guards the path we ship. It cannot intercept a hand-typed
# `docker compose down -v`.
preflight_args=()
if [ "${NEO_DEPLOY_INITIALIZE:-0}" = "1" ]; then preflight_args+=(--initialize); fi

echo "[deploy] running redeploy survivability preflight..."
node "$SCRIPT_DIR/../../scripts/maintenance/redeployPreflight.mjs" "${preflight_args[@]}"

# Build + recreate containers, KEEPING named volumes and the backup bind-mount.
# `--wait` blocks until every service with a healthcheck reports healthy and
# exits non-zero if one does not — this is the deploy health gate. `set -e`
# then fails the job, so a broken redeploy is never reported as success.
compose up -d --build --wait

echo "[deploy] all services healthy — redeploy complete"
compose ps
