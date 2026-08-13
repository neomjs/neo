# ---------------------------------------------------------------------------------------
# Neo source acquisition. DEFAULT: a pinned git clone — portable (no co-located
# local checkout required, so any operator / CI host can build), correct-branch + freshly
# pulled, reproducible per ref. Dev iteration can opt into the local build context with
# `--build-arg NEO_SOURCE=local` (the build context must then be the neo repo root). A
# published npm package supersedes this after the v13 release.
#   NEO_SOURCE   : 'git' (default) | 'local'
#   NEO_REF      : git ref to fetch. MUST be a full 40-hex commit SHA — a mutable ref is
#                  refused, because it does not merely cost reproducibility, it costs
#                  FRESHNESS (see the source-git stage). Resolve a channel to a SHA first.
#   NEO_REPO_URL : neo repository (MIT-licensed) to clone from
# ---------------------------------------------------------------------------------------
ARG NEO_SOURCE=git
ARG NEO_REF=dev
ARG NEO_REPO_URL=https://github.com/neomjs/neo.git

FROM alpine/git AS source-git
ARG NEO_REF
ARG NEO_REPO_URL
ARG NEO_ALLOW_MUTABLE_REF=
WORKDIR /neo
# FAIL CLOSED on a ref that is not content-addressed.
#
# The fetch below is ONE cache-keyed RUN. Its cache key is the command string plus the ARG
# values it consumes, so with a channel name like `dev` that key is byte-identical on every
# build: Docker reuses the layer and THE FETCH NEVER RUNS AGAIN. The image then packages
# whatever the channel pointed at the first time the layer was built, and the build log still
# prints the fetch command, because printing a cached layer's command is what Docker does.
#
# This is measured, not theorised. D#16304 records a `docker compose up -d --build --wait`
# against this stack that was a full cache hit: no image built, containers recreated from
# three-week-old images, and the running revision moved BACKWARDS (cf5f366344 -> c2304ea118)
# while `redeployPreflight`, `--wait` health, and exit code zero all reported success. `--wait`
# proves health; it never proves revision.
#
# So a SHA is not "for reproducibility" with freshness assumed. Without a SHA there is no
# freshness at all, and the two options are not `pinned` versus `tracking` — they are pinned
# deliberately versus pinned accidentally, at an arbitrary past commit.
#
# What this guard does NOT buy, stated rather than implied: it constrains the ref, not the
# cache. `NEO_ALLOW_MUTABLE_REF=1` re-admits a channel for a hand-run build and re-admits the
# freeze with it — that build is only fresh if it also passes `--no-cache`.
#
# The override is EXACT EQUALITY to `1`, never shell truthiness. An escape hatch is a tiny
# authorization parser, and `[ -n "$VAR" ]` would make `0`, `false`, a stray space, and any
# typo all mean YES — so misspelling a safety override would silently admit the cache-frozen
# layer this guard exists to refuse. A near-miss value must fail the same way an absent one
# does; `NEO_ALLOW_MUTABLE_REF=0` meaning "allow" is the specific absurdity being avoided.
RUN neo_ref_is_sha=0; \
    printf '%s' "${NEO_REF}" | grep -Eq '^[0-9a-f]{40}$' && neo_ref_is_sha=1; \
    if [ "${neo_ref_is_sha}" -eq 0 ] && [ "${NEO_ALLOW_MUTABLE_REF}" != "1" ]; then \
        echo "[deploy] FATAL: NEO_REF='${NEO_REF}' is not a full 40-hex commit SHA." >&2; \
        echo "[deploy] A mutable ref freezes this layer: a second build reuses the first" >&2; \
        echo "[deploy]   build's commit forever, and reports success while doing it." >&2; \
        echo "[deploy] Resolve the channel once, then pin once:" >&2; \
        echo "[deploy]   export NEO_REVISION=\$(git ls-remote ${NEO_REPO_URL} <channel> | cut -f1)" >&2; \
        echo "[deploy]   (Compose maps that one pin to both NEO_REF and NEO_REVISION.)" >&2; \
        echo "[deploy] Dev iteration instead: --build-arg NEO_SOURCE=local" >&2; \
        echo "[deploy] Deliberate exception: --build-arg NEO_ALLOW_MUTABLE_REF=1 exactly (no" >&2; \
        echo "[deploy]   other value opts in), which accepts a FROZEN layer unless the build" >&2; \
        echo "[deploy]   also passes --no-cache." >&2; \
        exit 1; \
    fi

# fetch + checkout (NOT `clone --branch`, which rejects raw SHAs) so NEO_REF accepts a full
# commit SHA — the only value that is its own content. GitHub serves reachable SHAs.
RUN git init -q && git remote add origin "${NEO_REPO_URL}" \
    && git fetch --depth 1 origin "${NEO_REF}" \
    && git checkout -q --detach FETCH_HEAD \
    && git rev-parse HEAD > /neo/.neo-revision

FROM node:24-alpine AS source-local
WORKDIR /neo
COPY . .
# `local` mode is a dev-iteration escape hatch: this stage has no `git` binary, and
# inferring a revision from a working tree would fabricate provenance. Stamp an
# explicit non-SHA marker so /app/.neo-revision is never absent and never mistaken
# for a real commit.
RUN echo 'local-build' > /neo/.neo-revision

# Select the source stage from the NEO_SOURCE build arg. In 'git' mode the source-local
# stage is never built, so no local build context is required (the portability fix).
FROM source-${NEO_SOURCE} AS source

FROM node:24-alpine AS builder

WORKDIR /app

# better-sqlite3 is part of the Memory Core runtime and needs native build tools
# when installing on Alpine. The tools stay in this build stage.
RUN apk add --no-cache python3 make g++

COPY --from=source /neo/package*.json ./
# --ignore-scripts skips the root `prepare` lifecycle hook before buildScripts/
# is copied. Neo's Agent OS runtime packages currently live in devDependencies;
# installing them here keeps that cost inside this Right-Hemisphere image.
RUN npm ci --ignore-scripts

COPY --from=source /neo ./

# The Brain tier is opt-in since the two-path install tier landed: the pruned lock gives the
# base set, and the plane is a Brain environment by definition (Memory Core's graph storage
# dynamically imports better-sqlite3; the KB rides the chromadb client). Arm it from the
# checkout's own installer — `--no-save`, so the image's manifests stay untouched; lifecycle
# scripts stay off here, and the config materialization below keeps its explicit ownership.
RUN node ./buildScripts/util/installBrain.mjs --ignore-scripts

# Path A for #10964: generate gitignored per-server config.mjs files inside the
# image so clean external checkouts do not need manual template copies.
RUN npm rebuild better-sqlite3 && node ./ai/scripts/setup/initServerConfigs.mjs

FROM node:24-alpine
WORKDIR /app

# `git` is required by `ai/services/knowledge-base/helpers/GitMirror.mjs` for
# tenant-repo clone/fetch. The orchestrator daemon's tenantRepoSync lane and
# the container-plane `syncTenantRepos.mjs` one-shot both shell out to it.
RUN apk add --no-cache libstdc++ git

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV NEO_TRANSPORT=streamable-http

# Accept the target service as build arguments.
# `TARGET_SERVER` selects an MCP server image ('knowledge-base' or 'memory-core').
# `SERVICE_ENTRYPOINT` generalizes the entrypoint so non-MCP-server services — e.g.
# the Agent OS orchestrator (ADR 0014 cloud topology, Sub B #11723) — build from the
# same image: pass `SERVICE_ENTRYPOINT=ai/daemons/orchestrator/daemon.mjs`.
ARG TARGET_SERVER
ARG SERVICE_ENTRYPOINT=ai/mcp/server/${TARGET_SERVER}/mcp-server.mjs
ENV SERVER_ENTRYPOINT=${SERVICE_ENTRYPOINT}

# Deployment provenance (#15774). THREE facts, each on a surface that cannot lie:
#
#   1. `org.neomjs.image.requested-ref` — the REQUESTED selector (policy input). May be
#      a mutable channel; that is legitimate for a request and meaningless as identity.
#      Vendor-namespaced on purpose: no OCI standard key means "what was asked for".
#   2. `org.opencontainers.image.revision` — the PACKAGED source-control revision, per
#      the OCI image-spec contract. Caller-supplied and EMPTY BY DEFAULT, because a
#      LABEL can only read a build ARG and Docker cannot populate a later-stage ARG
#      from a file written in an earlier stage. Empty means "not asserted"; it must
#      never contain a channel name. To get a spec-correct value, resolve the channel
#      to a full SHA first and pass NEO_REVISION — Compose maps that one operator pin
#      to both internal arguments.
#   3. /app/.neo-revision — the build-time RESOLVED commit, written by the source stage.
#      The only surface that is always populated and always true, so it is the primary
#      provenance fact; the label above is its machine-readable echo when the caller
#      resolved properly.
#
# Do NOT pass NEO_REVISION for a `NEO_SOURCE=local` build: nothing upstream was
# packaged, /app/.neo-revision says `local-build`, and an OCI revision claim there
# would be a fabrication.
#
# These ARGs are re-declared here because pre-`FROM` ARGs do not reach build stages;
# they sit after the expensive COPY/apk layers so a changed ref does not invalidate
# them. NEO_REF and NEO_REPO_URL inherit the global defaults declared at the top.
ARG NEO_REF
ARG NEO_REPO_URL
ARG NEO_REVISION=

# The label is an assertion, while /app/.neo-revision is measured artifact truth.
# Fail the build before stamping a non-empty assertion that disagrees with the source
# stage. This also rejects a revision claim on `NEO_SOURCE=local` (`local-build`).
#
# The SECOND clause exists because the first is OFF in the configuration most likely to be
# wrong: `NEO_REVISION` is empty by default, so an unpinned build asserted nothing and this
# gate — the one mechanism that could catch a stale package — was a no-op exactly there.
# Now that the source stage refuses a non-SHA `NEO_REF`, that ARG is itself a checkable claim
# and needs no caller to supply one: a SHA-shaped `NEO_REF` must equal what was packaged.
# It stays silent for `NEO_SOURCE=local` (whose `NEO_REF` is the non-SHA global default) and
# fires if a local build is handed a SHA — a revision claim over `local-build` is the
# fabrication the note above already forbids.
RUN actual_revision="$(cat /app/.neo-revision)" \
    && if [ -n "${NEO_REVISION}" ] && [ "${NEO_REVISION}" != "${actual_revision}" ]; then \
        echo "[deploy] FATAL: NEO_REVISION integrity mismatch: asserted '${NEO_REVISION}', packaged '${actual_revision}'." >&2; \
        exit 1; \
    fi \
    && if printf '%s' "${NEO_REF}" | grep -Eq '^[0-9a-f]{40}$' && [ "${NEO_REF}" != "${actual_revision}" ]; then \
        echo "[deploy] FATAL: NEO_REF integrity mismatch: requested '${NEO_REF}', packaged '${actual_revision}'." >&2; \
        echo "[deploy] A SHA-pinned build that packaged a different commit means the source layer" >&2; \
        echo "[deploy]   was served from cache. Rebuild with --no-cache." >&2; \
        exit 1; \
    fi

LABEL org.neomjs.image.requested-ref="${NEO_REF}"
LABEL org.opencontainers.image.revision="${NEO_REVISION}"
LABEL org.opencontainers.image.source="${NEO_REPO_URL}"

CMD ["sh", "-c", "node ${SERVER_ENTRYPOINT}"]
