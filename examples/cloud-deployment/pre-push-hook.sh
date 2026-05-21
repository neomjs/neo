#!/usr/bin/env bash
#
# pre-push hook — Cloud-Native KB ingestion (Epic #11624).
# Streams the changed files of a `git push` into the tenant's Knowledge Base.
#
# Install:  cp examples/cloud-deployment/pre-push-hook.sh .git/hooks/pre-push
#           chmod +x .git/hooks/pre-push
# Contract: learn/agentos/cloud-deployment/HookWiring.md
#
set -euo pipefail

TENANT_ID="${NEO_KB_TENANT_ID:-example-tenant}"
# The ai:ingest-tenant CLI inside the neo.mjs dependency. Override via NEO_INGEST_CLI.
INGEST_CLI="${NEO_INGEST_CLI:-node_modules/neo.mjs/buildScripts/ai/ingestTenant.mjs}"
EMPTY="0000000000000000000000000000000000000000"

# git feeds pre-push "<local-ref> <local-sha> <remote-ref> <remote-sha>" lines on stdin.
while read -r local_ref local_sha remote_ref remote_sha; do
    [ "$local_sha" = "$EMPTY" ] && continue          # branch deletion — nothing to ingest

    if [ "$remote_sha" = "$EMPTY" ]; then
        base="$(git hash-object -t tree /dev/null)"  # new branch — diff from the empty tree
    else
        base="$remote_sha"
    fi

    changed="$(git diff --name-only --diff-filter=ACMR "$base" "$local_sha" || true)"
    deleted="$(git diff --name-only --diff-filter=D    "$base" "$local_sha" || true)"

    if [ -n "$changed" ]; then
        # Stream each changed file as a raw ingest record — {sourcePath, content} JSONL —
        # into the bulk facade; the server parses raw files with a registered parser.
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({sourcePath:process.argv[1],content:fs.readFileSync(process.argv[1],"utf8")})+"\n")' "$f"
        done <<< "$changed" | node "$INGEST_CLI" "$TENANT_ID" --from-stdin
    else
        echo "[kb-pre-push] no changed files to ingest"
    fi

    # --- Extension point: deletion signaling ---
    # The bulk CLI ingests changed files only. To propagate deletions, send an
    # `ingest_source_files` envelope carrying `deleted` tombstones plus
    # `baseRevision`/`headRevision` (= "$base" / "$local_sha"). See HookWiring.md.
    if [ -n "$deleted" ]; then
        echo "[kb-pre-push] $(printf '%s\n' "$deleted" | grep -c .) deleted path(s) — wire deletion signaling per HookWiring.md"
    fi
done
