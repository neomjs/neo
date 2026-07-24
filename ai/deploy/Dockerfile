# ---------------------------------------------------------------------------------------
# Neo source acquisition. DEFAULT: a pinned git clone — portable (no co-located
# local checkout required, so any operator / CI host can build), correct-branch + freshly
# pulled, reproducible per ref. Dev iteration can opt into the local build context with
# `--build-arg NEO_SOURCE=local` (the build context must then be the neo repo root). A
# published npm package supersedes this after the v13 release.
#   NEO_SOURCE   : 'git' (default) | 'local'
#   NEO_REF      : git ref to clone (default 'dev'; pin to a tag/SHA for full reproducibility)
#   NEO_REPO_URL : neo repository (MIT-licensed) to clone from
# ---------------------------------------------------------------------------------------
ARG NEO_SOURCE=git
ARG NEO_REF=dev
ARG NEO_REPO_URL=https://github.com/neomjs/neo.git

FROM alpine/git AS source-git
ARG NEO_REF
ARG NEO_REPO_URL
WORKDIR /neo
# fetch + checkout (NOT `clone --branch`, which rejects raw SHAs) so NEO_REF accepts a
# branch, a tag, OR a full commit SHA (the reproducible pin). GitHub serves reachable SHAs.
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

# Path A for #10964: generate gitignored per-server config.mjs files inside the
# image so clean external checkouts do not need manual template copies.
RUN npm rebuild better-sqlite3 && node ./ai/scripts/setup/initServerConfigs.mjs

FROM node:24-alpine
WORKDIR /app

# `git` is required by `ai/services/knowledge-base/helpers/GitMirror.mjs` for
# tenant-repo clone/fetch. The orchestrator daemon's tenantRepoSync lane and
# the operator-bulk `syncTenantRepos.mjs` CLI both shell out to it.
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
#      to a full SHA first and pass NEO_REVISION — which is exactly the resolve-once
#      contract the rollout-authority design calls for.
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
LABEL org.neomjs.image.requested-ref="${NEO_REF}"
LABEL org.opencontainers.image.revision="${NEO_REVISION}"
LABEL org.opencontainers.image.source="${NEO_REPO_URL}"

CMD ["sh", "-c", "node ${SERVER_ENTRYPOINT}"]
