FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV NEO_TRANSPORT=sse

# Accept target server as a build argument: 'knowledge-base' or 'memory-core'
ARG TARGET_SERVER
ENV SERVER_ENTRYPOINT=ai/mcp/server/${TARGET_SERVER}/mcp-server.mjs

CMD ["sh", "-c", "node ${SERVER_ENTRYPOINT}"]
