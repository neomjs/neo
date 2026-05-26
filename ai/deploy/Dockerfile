FROM node:24-alpine AS builder

WORKDIR /app

# better-sqlite3 is part of the Memory Core runtime and needs native build tools
# when installing on Alpine. The tools stay in this build stage.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# --ignore-scripts skips the root `prepare` lifecycle hook before buildScripts/
# is copied. Neo's Agent OS runtime packages currently live in devDependencies;
# installing them here keeps that cost inside this Right-Hemisphere image.
RUN npm ci --ignore-scripts

COPY . .

# Path A for #10964: generate gitignored per-server config.mjs files inside the
# image so clean external checkouts do not need manual template copies.
RUN npm rebuild better-sqlite3 && node ./ai/scripts/setup/initServerConfigs.mjs

FROM node:24-alpine
WORKDIR /app

RUN apk add --no-cache libstdc++

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV NEO_TRANSPORT=sse

# Accept the target service as build arguments.
# `TARGET_SERVER` selects an MCP server image ('knowledge-base' or 'memory-core').
# `SERVICE_ENTRYPOINT` generalizes the entrypoint so non-MCP-server services — e.g.
# the Agent OS orchestrator (ADR 0014 cloud topology, Sub B #11723) — build from the
# same image: pass `SERVICE_ENTRYPOINT=ai/daemons/orchestrator/daemon.mjs`.
ARG TARGET_SERVER
ARG SERVICE_ENTRYPOINT=ai/mcp/server/${TARGET_SERVER}/mcp-server.mjs
ENV SERVER_ENTRYPOINT=${SERVICE_ENTRYPOINT}

CMD ["sh", "-c", "node ${SERVER_ENTRYPOINT}"]
