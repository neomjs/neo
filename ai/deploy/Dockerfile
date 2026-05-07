FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package*.json ./
# --ignore-scripts skips the `prepare` lifecycle hook (initServerConfigs +
# downloadKnowledgeBase). Both are dev-time only — production Docker images
# don't need template-config copying or KB-artifact downloads. Without this
# flag, npm ci fails because buildScripts/ has not been COPY'd yet (#10902).
RUN npm ci --omit=dev --ignore-scripts

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
