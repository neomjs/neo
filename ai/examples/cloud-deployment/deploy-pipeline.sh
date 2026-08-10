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

# Resolve sibling maintenance paths from the script location. This is not a Compose default: the
# caller still has to name the deployment composition explicitly below.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The reference pipeline cannot infer which deployment composition it owns. The base Compose file
# supplies shared topology, but concrete planes add the auth/provider profile that makes that topology
# runnable. Selecting the base file when the caller omitted this input therefore chooses an incomplete
# security posture rather than a compatible default.
#
# Collapse UNSET and EXPLICITLY-EMPTY intentionally: both mean the caller named no deployment. The
# zero-entry guard below rejects them before revision resolution, preflight, or Docker. A caller must
# supply the plane's explicit file set, discovered from its Compose labels as described in
# PipelineWiring.md.
COMPOSE_FILE="${NEO_DEPLOY_COMPOSE_FILE:-}"

# A real plane is rarely ONE compose file. The canonical local Agent OS runs `docker-compose.yml`
# plus `docker-compose.local-agent-os.yml`, and a single `-f` silently drops the overlay — so the
# services come up with the base contract while the operator believes the overlay applied. Measured
# on such a plane, the two renderings differ by 80 lines: without the overlay the auth mode is unset,
# the model provider is empty, and the healthcheck token file is absent.
#
# `NEO_DEPLOY_COMPOSE_FILE` therefore accepts a `:`-delimited LIST, matching Docker's own COMPOSE_FILE
# convention, and expands to repeated `-f` in declaration order (later files override earlier ones,
# which is Compose's merge order — reordering them changes the result). A single path is unchanged,
# so every explicit single-file caller and downstream adaptation keeps its exact behaviour.
# `compose_file_count` is tracked separately because `${#compose_file_args[@]}` counts ARRAY ELEMENTS
# — each file contributes both a `-f` and a path — so using it as a file count reports double. Caught
# by the rehearsal witness printing "(4 file(s))" for two files.
compose_file_args=()
compose_file_count=0
first_compose_file=""
while IFS= read -r compose_file_entry; do
    if [ -n "$compose_file_entry" ]; then
        compose_file_args+=(-f "$compose_file_entry")
        compose_file_count=$((compose_file_count + 1))

        if [ -z "$first_compose_file" ]; then
            first_compose_file="$compose_file_entry"
        fi
    fi
done <<< "$(printf '%s' "$COMPOSE_FILE" | tr ':' '\n')"

if [ "$compose_file_count" -eq 0 ]; then
    echo "[deploy] FATAL: NEO_DEPLOY_COMPOSE_FILE must name an ordered, auth-complete Compose file set. Docker was NOT invoked." >&2
    exit 1
fi

# Compose resolves its default `.env` from the first declared file's project directory. Keep that
# project-facing location stable while the durable carrier lives outside the checkout, so source
# updates cannot discard an admitted prescription. The materializer owns the adoption/symlink
# safety contract; this pipeline only supplies the explicit paths.
compose_project_dir="$(dirname "$first_compose_file")"
prescription_root="${NEO_HOST_DEPLOYMENT_PRESCRIPTION_ROOT:-${HOME}/.neo-ai/deployment-prescriptions}"
prescription_ledger="$prescription_root/prescriptions.jsonl"
prescription_environment="$prescription_root/active.env"
prescription_deploy_lock="$prescription_root/deploy.lock"
project_environment="$compose_project_dir/.env"
prescription_cli="$SCRIPT_DIR/../../scripts/maintenance/materializeDeploymentPrescriptions.mjs"

# A stable project name pins named-volume identity across redeploys. Export the
# same value consumed by docker-compose.yml for its top-level project name and
# the orchestrator runtime-access target identity. Ordinary redeploys retain the
# reference default; initialization cannot use it, because a defaulted selector
# cannot prove that a differently named plane is absent.
DECLARED_PROJECT_NAME="${NEO_DEPLOY_PROJECT_NAME:-}"
PROJECT_NAME="${DECLARED_PROJECT_NAME:-neo-agent-os}"

if [ "${NEO_DEPLOY_INITIALIZE:-0}" = "1" ] && [ -z "$DECLARED_PROJECT_NAME" ]; then
    echo "[deploy] FATAL: NEO_DEPLOY_PROJECT_NAME must be explicitly declared when NEO_DEPLOY_INITIALIZE=1; --initialize will not use the ordinary redeploy default. Docker was NOT invoked." >&2
    exit 1
fi

export NEO_DEPLOY_PROJECT_NAME="$PROJECT_NAME"

# Profiles to deploy. Default: the full cloud stack + ingress. Override by
# passing profile names as arguments, or via NEO_DEPLOY_PROFILES.
profile_args=()
if [ "$#" -gt 0 ]; then
    for p in "$@"; do profile_args+=(--profile "$p"); done
else
    for p in ${NEO_DEPLOY_PROFILES:-cloud ingress}; do profile_args+=(--profile "$p"); done
fi

# `compose_file_args` is guaranteed non-empty by the abort above, so expanding it is safe on bash 3.2
# where an EMPTY array expansion is an unbound-variable error under `set -u` (see the note at the
# preflight below — macOS ships 3.2 and hosted CI does not, so that class fails only on maintainer machines).
#
# Compose's default lookup follows project-directory rules that vary with file/flag composition. Pin
# the same persistent carrier on EVERY pipeline-owned Compose call so the delivery contract does not
# depend on implicit lookup and the final `ps` observes the same interpolation input as `up`.
compose() {
    docker compose --env-file "$prescription_environment" \
        "${compose_file_args[@]}" -p "$PROJECT_NAME" "${profile_args[@]}" "$@"
}

# Resolve the deployed revision BEFORE Docker runs (#15792). Every run pins:
# there is deliberately no unpinned path, because this is the reference pipeline
# and its default is what propagates to every downstream deployment.
#
# NEO_REF is the selector input at this pre-resolution boundary. After resolution,
# Compose accepts ONE canonical NEO_REVISION pin and maps it to both internal Docker
# arguments: source acquisition and the OCI revision assertion. Unset the selector
# before Docker so it cannot survive as a second, potentially conflicting build input.
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

unset NEO_REF
export NEO_REVISION="$resolved_revision"

echo "[deploy] selector:     $NEO_SELECTOR"
echo "[deploy] revision:     $resolved_revision   <- built into the images"
echo "[deploy] host-checkout: $(git -C "$SCRIPT_DIR" describe --tags --always 2>/dev/null || echo unknown)   (this host only; NOT what is deployed)"
echo "[deploy] compose:  ${compose_file_args[*]}   ($compose_file_count file(s), merge order left to right)"
echo "[deploy] project:  $PROJECT_NAME"
echo "[deploy] profiles: ${profile_args[*]}"

# SURVIVABILITY GATE — runs BEFORE any container lifecycle mutation. On `--initialize` it may issue
# a read-only Docker volume metadata query; it never starts, execs, recreates, or removes a container.
#
# Refuses unless a verified, non-empty, restorable pre-transition bundle exists. `up -d --build`
# recreates containers, and a redeploy that crosses into an unrecoverable plane is exactly the
# failure this guards: a deployment lost its Memory Core corpus, and the only bundle in its ledger
# completed 25 minutes AFTER the new stack came up, capturing an already-empty plane.
#
# On a GENUINE first install there is no bundle yet and nothing to protect, so pass --initialize:
#
#     NEO_DEPLOY_PROJECT_NAME=my-agent-os NEO_DEPLOY_INITIALIZE=1 \
#         ai/examples/cloud-deployment/deploy-pipeline.sh
#
# Both values are explicit declarations on purpose. A first deployment and a plane that was destroyed
# or relocated both present as ABSENCE, and no heuristic separates them — so refusing on absence alone
# would block the first legitimate deploy, while proceeding on absence is how the incident happened.
# The ordinary-redeploy project default cannot cross this branch: zero volumes under a defaulted label
# says nothing about differently named planes on the same host.
# The gate records a marker beside the bundles (on the bind-mount `down -v` does not touch), so a
# later absence is informative rather than ambiguous. --initialize on an already-initialized host is
# REFUSED: the escape hatch must not become the bypass.
#
# Scope, stated honestly: this guards the path we ship. It cannot intercept a hand-typed
# `docker compose down -v`.
# No array. Under `set -u`, expanding an EMPTY bash array as `"${arr[@]}"` is an unbound-variable
# error on bash 3.2 — which macOS ships and CI does not, so this failed on maintainer machines while
# hosted CI stayed green on it. Two explicit invocations are clearer than the `${arr[@]+...}`
# incantation that works around it, and they cannot regress the same way.
PREFLIGHT="$SCRIPT_DIR/../../scripts/maintenance/redeployPreflight.mjs"

echo "[deploy] running redeploy survivability preflight..."
if [ "${NEO_DEPLOY_INITIALIZE:-0}" = "1" ]; then
    node "$PREFLIGHT" --initialize --compose-project "$DECLARED_PROJECT_NAME"
else
    node "$PREFLIGHT" --compose-project "$PROJECT_NAME"
fi

# One host may receive overlapping deploy jobs. The materialized environment and state manifest are a
# pair, so a second job must not replace either between this job's materialize and receipt phases.
# `mkdir` is the cross-process atomic claim; the subshell's EXIT trap releases it on every ordinary
# success/failure path without replacing the revision probe's parent-shell cleanup trap.
(
    mkdir -p "$prescription_root"

    if ! mkdir "$prescription_deploy_lock" 2>/dev/null; then
        echo "[deploy] FATAL: deployment lock exists at ${prescription_deploy_lock}; another deploy is active or the stale lock needs operator inspection." >&2
        echo "[deploy] No prescription was materialized and Docker was NOT invoked." >&2
        exit 1
    fi

    release_prescription_deploy_lock() {
        rmdir "$prescription_deploy_lock" 2>/dev/null || true
    }
    trap release_prescription_deploy_lock EXIT

    # Bind state and receipt to this exact deployment transaction. The lock serializes the shared
    # active environment; the UUID prevents a later run from ever satisfying this run's receipt
    # contract with a different manifest, even if artifacts are inspected after the lock is released.
    deployment_run_id="$(node --input-type=module -e \
        "import {randomUUID} from 'node:crypto'; process.stdout.write(randomUUID())")"
    prescription_run_root="$prescription_root/runs/$deployment_run_id"
    prescription_state="$prescription_run_root/materialized-state.json"
    prescription_receipt="$prescription_run_root/delivery-receipt.json"

    # Materialize admitted host prescriptions before the first Docker mutation. A refusal exits through
    # `set -e`, leaving the currently running plane untouched. `--adopt-existing-env` is explicit here:
    # the materializer preserves unrelated operator entries before replacing the project `.env` with its
    # durable carrier link.
    node "$prescription_cli" materialize \
        --ledger "$prescription_ledger" \
        --env "$prescription_environment" \
        --state "$prescription_state" \
        --project-env "$project_environment" \
        --compose-project "$PROJECT_NAME" \
        --run-id "$deployment_run_id" \
        --adopt-existing-env

    # Build + recreate containers, KEEPING named volumes and the backup bind-mount.
    # `--wait` blocks until every service with a healthcheck reports healthy and
    # exits non-zero if one does not — this is the deploy health gate. `set -e`
    # then fails the job, so a broken redeploy is never reported as success.
    compose up -d --build --wait

    # The receipt is a delivery claim, not an observation claim: reaching it proves the exact revision
    # passed Compose's health gate with the admitted environment. A failed `up --wait` exits before this
    # command, so no success artifact can survive a failed deployment.
    node "$prescription_cli" receipt \
        --env "$prescription_environment" \
        --state "$prescription_state" \
        --receipt "$prescription_receipt" \
        --run-id "$deployment_run_id" \
        --deployed-revision "$NEO_REVISION"

    echo "[deploy] all services healthy — redeploy complete"
    compose ps
)
