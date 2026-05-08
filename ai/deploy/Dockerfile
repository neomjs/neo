FROM node:24-alpine AS builder

WORKDIR /app

# better-sqlite3 is part of the Memory Core runtime and needs native build tools
# when installing on Alpine. The tools stay in this build stage.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# --ignore-scripts skips the root `prepare` lifecycle hook before buildScripts/
# is copied. Native runtime packages are rebuilt explicitly below.
RUN npm ci --omit=dev --ignore-scripts

COPY . .

# Path A for #10964: generate gitignored per-server config.mjs files inside the
# image so clean external checkouts do not need manual template copies.
RUN npm rebuild better-sqlite3 && node ./buildScripts/ai/initServerConfigs.mjs

FROM node:24-alpine
WORKDIR /app

RUN apk add --no-cache libstdc++

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV NEO_TRANSPORT=sse

# Accept target server as a build argument: 'knowledge-base' or 'memory-core'
ARG TARGET_SERVER
ENV SERVER_ENTRYPOINT=ai/mcp/server/${TARGET_SERVER}/mcp-server.mjs

CMD ["sh", "-c", "node ${SERVER_ENTRYPOINT}"]
