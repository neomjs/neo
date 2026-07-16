#!/usr/bin/env bash
#
# pre-push hook — Cloud-Native KB ingestion (Epic #11624).
# Streams the changed files of a `git push` into the tenant's Knowledge Base.
#
# Install:  cp ai/examples/cloud-deployment/pre-push-hook.sh .git/hooks/pre-push
#           chmod +x .git/hooks/pre-push
# Contract: learn/agentos/cloud-deployment/HookWiring.md
#
set -euo pipefail

TENANT_ID="${NEO_KB_TENANT_ID:-example-tenant}"
REPO_SLUG="${NEO_KB_REPO_SLUG:-example/repo}"
MCP_URL="${NEO_KB_MCP_URL:-}"
# The tenant-side MCP push client inside the neo.mjs dependency. Override via NEO_KB_PUSH_CLIENT.
PUSH_CLIENT="${NEO_KB_PUSH_CLIENT:-node_modules/neo.mjs/ai/scripts/maintenance/kbPushClient.mjs}"
# The ai:ingest-tenant CLI inside the neo.mjs dependency. Override via NEO_INGEST_CLI.
INGEST_CLI="${NEO_INGEST_CLI:-node_modules/neo.mjs/ai/scripts/maintenance/ingestTenant.mjs}"
EMPTY="0000000000000000000000000000000000000000"

build_remote_envelope() {
    CHANGED_PATHS="$changed" \
    DELETED_PATHS="$deleted" \
    BASE_REVISION="$base" \
    HEAD_REVISION="$local_sha" \
    REPO_SLUG="$REPO_SLUG" \
    TENANT_ID="$TENANT_ID" \
    node -e 'const fs=require("fs");const lines=s=>(s||"").split(/\n/).filter(Boolean);const files=lines(process.env.CHANGED_PATHS).filter(f=>fs.existsSync(f)).map(f=>({sourcePath:f,content:fs.readFileSync(f,"utf8")}));const deleted=lines(process.env.DELETED_PATHS).map(sourcePath=>({sourcePath,repoSlug:process.env.REPO_SLUG}));const envelope={tenantId:process.env.TENANT_ID,repoSlug:process.env.REPO_SLUG,files,deleted,baseRevision:process.env.BASE_REVISION,headRevision:process.env.HEAD_REVISION};process.stdout.write(JSON.stringify(envelope));'
}

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

    if [ -n "$MCP_URL" ]; then
        if [ -z "$changed" ] && [ -z "$deleted" ]; then
            echo "[kb-pre-push] no changed or deleted files to ingest"
            continue
        fi

        # Remote tenant mode (#11743): build one content-bearing ingest_source_files
        # envelope and submit it through the tenant-side remote MCP client.
        # Auth comes from NEO_KB_INGEST_TOKEN (or NEO_KB_TOKEN_ENV).
        envelope="$(build_remote_envelope)"
        printf '%s\n' "$envelope" | \
            NEO_KB_MCP_URL="$MCP_URL" \
            NEO_KB_TENANT_ID="$TENANT_ID" \
            NEO_KB_REPO_SLUG="$REPO_SLUG" \
            node "$PUSH_CLIENT" --from-stdin
        continue
    fi

    if [ -n "$changed" ]; then
        # Stream each changed file as a raw ingest record — {sourcePath, content} JSONL —
        # into the bulk facade. With no parserId on the record, the server applies its
        # raw-text fallback (one whole-file chunk); a deployment with a registered parser
        # adds the matching parserId here to chunk per that parser's contract instead.
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({sourcePath:process.argv[1],content:fs.readFileSync(process.argv[1],"utf8")})+"\n")' "$f"
        done <<< "$changed" | node "$INGEST_CLI" "$TENANT_ID" --from-stdin
    else
        echo "[kb-pre-push] no changed files to ingest"
    fi

    # --- Local bulk fallback limitation ---
    # The bulk CLI ingests changed files only. To propagate deletions in tenant mode,
    # set NEO_KB_MCP_URL so the hook uses ai:kb-push-client and sends an
    # ingest_source_files envelope with tombstones plus base/head revisions.
    if [ -n "$deleted" ]; then
        echo "[kb-pre-push] $(printf '%s\n' "$deleted" | grep -c .) deleted path(s) — wire deletion signaling per HookWiring.md"
    fi
done
