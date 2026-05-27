# Config Substrate Env-Var Audit

This audit satisfies [#10824](https://github.com/neomjs/neo/issues/10824), the Phase 1 AC1 feed ticket for [#10822](https://github.com/neomjs/neo/issues/10822).

## Scope

The scan covers environment reads under `ai/mcp/server/**` on `dev` after PR #10821 and before any #10824 implementation changes.

Commands:

```bash
rg -n 'process\.env\.[A-Z0-9_]+|process\.env\[[^]]+\]' ai/mcp/server
rg -n '\benv\.[A-Z0-9_]+' ai/mcp/server
rg -n 'resolveMcpHttpPort|resolveChromaHost|resolveChromaPort|resolvePublicUrl|legacyEnvVar|resolveEmbeddingProvider' ai/mcp/server
```

Direct `process.env.NAME` reads account for 53 unique env vars. Resolver-helper `env.NAME` reads add 7 more names whose actual `process.env` access is injected through `env = process.env`: `MCP_HTTP_PORT`, `SSE_PORT`, `NEO_CHROMA_HOST`, `NEO_CHROMA_PORT`, `NEO_PUBLIC_URL`, `NEO_EMBEDDING_PROVIDER`, and `NEO_CHROMA_EMBEDDING_PROVIDER`. The legacy Chroma fallback names `NEO_KB_CHROMA_HOST` and `NEO_KB_CHROMA_PORT` are passed as `legacyEnvVar` strings and read dynamically via `env[legacyEnvVar]`.

Target-tier shorthand:

| Tier | Meaning |
|---|---|
| Tier 1 | Shared `ai/config.template.mjs` default candidate; env remains only as a universal override when needed. |
| Tier 2 | Per-MCP-server `config.template.mjs` default candidate. |
| Tier 3 | `.env` keep-list candidate. The rationale names the keep category. |
| Delete | Legacy alias or topology flag scheduled for hard removal by #10822 follow-ups. |
| Defer | Needs #10825 or Phase 1.5 design before a final keep/delete decision. |

## Audit Table

| env var | current readers | target tier | deletion/keep rationale |
|---|---|---|---|
| `NEO_AUTH_HOST` | `memory-core/config.template.mjs:125`; `knowledge-base/config.template.mjs:70` | Tier 3 | Runtime binding for OAuth/OIDC authority host in deployed SSE mode. |
| `NEO_AUTH_ISSUER_URL` | `memory-core/config.template.mjs:128`; `knowledge-base/config.template.mjs:73` | Tier 3 | Runtime binding for external issuer URL behind reverse proxies. |
| `NEO_AUTH_PORT` | `memory-core/config.template.mjs:126`; `knowledge-base/config.template.mjs:71` | Tier 3 | Runtime binding for local auth server port; keep env-overridable for deployment. |
| `NEO_AUTH_REALM` | `memory-core/config.template.mjs:127`; `knowledge-base/config.template.mjs:72` | Tier 3 | Runtime binding for auth realm; deployment/operator concern. |
| `NEO_AUTH_TRUST_PROXY_IDENTITY` | `memory-core/config.template.mjs:131`; `knowledge-base/config.template.mjs:76` | Tier 3 | Multi-tenant isolation and reverse-proxy trust boundary toggle. |
| `NEO_AUTO_DREAM` | `memory-core/config.template.mjs:69` | Tier 3 | Operator one-shot/daemon toggle; should stay opt-in env to avoid multi-harness auto-fire. |
| `NEO_AUTO_GOLDEN_PATH` | `memory-core/config.template.mjs:75` | Tier 3 | Operator one-shot/daemon toggle for Golden Path synthesis. |
| `NEO_AUTO_INGEST_FS` | `memory-core/config.template.mjs:85` | Tier 3 | Operator one-shot ingestion toggle; avoid enabling by committed config drift. |
| `NEO_AUTO_SUMMARIZE` | `memory-core/config.template.mjs:33` | Tier 3 | Operator one-shot/single-writer-sensitive toggle. |
| `NEO_AUTO_SYNC` | `knowledge-base/config.template.mjs:25` | Tier 3 | Operator one-shot KB sync toggle; keep env-only to avoid surprise boot re-embedding. |
| `CHROMA_DATA_PATH` | `memory-core/Server.mjs:359`; `knowledge-base/Server.mjs:127` | Defer | Only used in diagnostic text for a manual `chroma run` command. #10825 should decide whether to remove or replace with config-derived coordinates. |
| `CHROMA_PORT` | `memory-core/Server.mjs:359`; `knowledge-base/Server.mjs:127` | Defer | Diagnostic-only Chroma command hint; not the active MCP topology selector. Audit under #10825 before removal. |
| `GEMINI_API_KEY` | `memory-core/services/HealthService.mjs:644`; `memory-core/services/TextEmbeddingService.mjs:55,128,203`; `memory-core/services/SessionService.mjs:94,125`; `knowledge-base/services/HealthService.mjs:158`; `knowledge-base/services/SearchService.mjs:59` | Tier 3 | Secret. Must stay env-backed. |
| `NEO_GRAPH_COLLECTION_NAME` | `memory-core/config.template.mjs:261` | Tier 2 | Collection name default; not a universal operator env concern. Move to per-server config unless tests prove env override is required. |
| `NEO_GRAPH_DECAY_FACTOR` | `memory-core/config.template.mjs:281` | Tier 2 | Memory Core graph tuning. Prefer per-server config default over env keep-list. |
| `HOST` | `shared/services/TransportService.mjs:112` | Defer | Bare generic env fallback for advertised URL construction. `NEO_PUBLIC_URL` is the canonical deployment surface; #10825/Phase 1.5 should decide whether `HOST` remains. |
| `LOCALAPPDATA` | `memory-core/services/lifecycle/InferenceLifecycleService.mjs:120` | Tier 3 | Host OS discovery for Windows local inference integration; not a Neo operator var but legitimate process environment input. |
| `MCP_HTTP_PORT` | `shared/helpers/DeploymentConfig.mjs:36`; `memory-core/config.template.mjs:103`; `knowledge-base/config.template.mjs:48` | Tier 3 | Runtime binding for SSE/HTTP server port. Keep one canonical name per concept. |
| `NEO_MEMORY_COLLECTION_NAME` | `memory-core/config.template.mjs:259` | Tier 2 | Collection name default; move to per-server config unless container override remains a proven need. |
| `NEO_AGENT_ID` | `knowledge-base/Server.mjs:189,191`; `knowledge-base/services/KBRecorderService.mjs:202`; `knowledge-base/services/toolService.mjs:42` | Tier 3 | Identity binding for KB telemetry and request attribution. Keep until request-context identity fully replaces it. |
| `NEO_AGENT_IDENTITY` | `shared/services/StdioIdentityResolver.mjs:70` | Tier 3 | Canonical local agent identity binding for stdio MCP sessions. |
| `NEO_AI_MCP_KB_OPENAPI_PATH` | `knowledge-base/services/toolService.mjs:15` | Tier 2 | Tool-service path override. Prefer per-server config/test override rather than global keep-list unless external packaging needs env injection. |
| `NEO_CHROMA_HOST` | `shared/helpers/DeploymentConfig.mjs:70`; `knowledge-base/config.template.mjs:119`; `memory-core/config.template.mjs:243` | Tier 3 | Runtime binding for shared Chroma host; canonical replacement for server-prefixed aliases. |
| `NEO_CHROMA_PORT` | `shared/helpers/DeploymentConfig.mjs:102`; `knowledge-base/config.template.mjs:127`; `memory-core/config.template.mjs:244` | Tier 3 | Runtime binding for shared Chroma port; canonical replacement for server-prefixed aliases. |
| `NEO_CHROMA_UNIFIED` | `memory-core/config.template.mjs:208`; `knowledge-base/config.template.mjs:111` | Removed | Retired in v13 per #11011. |
| `NEO_CHROMA_EMBEDDING_PROVIDER` | `memory-core/helpers/EmbeddingProviderConfig.mjs:15` | Delete | Legacy dev-branch-only alias targeted by #10823. |
| `NEO_CONCEPT_DISCOVERY_MIN_SOURCE_LENGTH` | `memory-core/config.template.mjs:313` | Tier 2 | Memory Core daemon tuning. Move to per-server config unless one-shot operator override is still desired. |
| `NEO_CONCEPT_DISCOVERY_PR_SCAN_LIMIT` | `memory-core/config.template.mjs:312` | Tier 2 | Memory Core daemon tuning. Move to per-server config. |
| `NEO_EMBEDDING_PROVIDER` | `memory-core/helpers/EmbeddingProviderConfig.mjs:14`; `memory-core/config.template.mjs:147` | Tier 1 | Shared provider selector. Tier 1 default is the 4096-dim `openAiCompatible` route; env override remains available for tests/deployments. |
| `NEO_GUIDE_GAP_WEIGHT_THRESHOLD` | `memory-core/config.template.mjs:296` | Tier 2 | Concept-gap tuning. Prefer Memory Core config. |
| `NEO_KB_AUTO_START_DATABASE` | `knowledge-base/config.template.mjs:30` | Tier 3 | Operator one-shot lifecycle toggle for local Chroma startup. |
| `NEO_KB_CHROMA_HOST` | `memory-core/config.template.mjs:243`; `shared/helpers/DeploymentConfig.mjs:71` | Delete | Legacy server-prefixed alias targeted by #10823. |
| `NEO_KB_CHROMA_PORT` | `memory-core/config.template.mjs:244`; `shared/helpers/DeploymentConfig.mjs:103` | Delete | Legacy server-prefixed alias targeted by #10823. |
| `NEO_KB_FAQ_CONCEPT_LIMIT` | `knowledge-base/config.template.mjs:167` | Tier 2 | KB FAQ clustering tuning. Per-server config is the cleaner substrate. |
| `NEO_KB_FAQ_MIN_COUNT` | `knowledge-base/config.template.mjs:151` | Tier 2 | KB FAQ clustering tuning. Per-server config. |
| `NEO_KB_FAQ_SIMILARITY_THRESHOLD` | `knowledge-base/config.template.mjs:160` | Tier 2 | KB FAQ clustering tuning. Per-server config. |
| `NEO_LAZY_EDGES_QUEUE_PATH` | `memory-core/config.template.mjs:380` | Tier 2 | Memory Core local path. Keep in config; env override is not a universal deployment category unless container bind-mounts require it. |
| `NEO_MAILBOX_DEFAULT_REPLY_POLICY` | `memory-core/config.template.mjs:374` | Tier 3 | Multi-tenant isolation policy. Legitimate env keep-list candidate for deployment mode. |
| `NEO_MC_PRIMARY` | `memory-core/config.template.mjs:54` | Delete | Legacy single-writer process-role flag (retired by #10972). |
| `NEO_MEMORY_CORE_DB_PATH` | `knowledge-base/config.template.mjs:142` | Delete | Legacy/superseded fallback for `NEO_MEMORY_DB_PATH`; not named in #10823 but should be folded into alias cleanup or a sibling deletion ticket. |
| `NEO_MEMORY_DB_PATH` | `knowledge-base/config.template.mjs:141` | Tier 3 | Runtime binding for KB telemetry to shared Memory Core SQLite path. |
| `NEO_MEM_AUTO_START_DATABASE` | `memory-core/config.template.mjs:59` | Tier 3 | Operator one-shot lifecycle toggle for local Chroma startup. |
| `NEO_MEM_AUTO_START_INFERENCE` | `memory-core/config.template.mjs:64` | Tier 3 | Operator one-shot lifecycle toggle for local inference startup. |
| `NEO_MODEL_PROVIDER` | `memory-core/config.template.mjs:138` | Tier 1 | Shared generation provider selector. Tier 1 default plus optional env override. |
| `NEO_OLLAMA_EMBEDDING_MODEL` | `memory-core/config.template.mjs:154` | Tier 1 | Shared provider block value. Tier 1 default plus optional env override. |
| `NEO_OLLAMA_HOST` | `memory-core/config.template.mjs:152` | Tier 1 | Shared provider block value. Tier 1 default plus optional env override for host binding. |
| `NEO_OLLAMA_KEEP_ALIVE` | `memory-core/config.template.mjs:459` | Tier 1 | Shared provider request-retention value. Default `-1`; env override supports shorter windows or `0` unload control. |
| `NEO_OLLAMA_MODEL` | `memory-core/config.template.mjs:153` | Tier 1 | Shared provider block value. Tier 1 default plus optional env override. |
| `NEO_OPENAI_COMPATIBLE_API_KEY` | `memory-core/config.template.mjs:164` | Tier 3 | Secret for OpenAI-compatible providers. Keep env-backed. |
| `NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL` | `memory-core/config.template.mjs:163` | Tier 1 | Shared provider block value. Tier 1 default plus optional env override. |
| `NEO_OPENAI_COMPATIBLE_HOST` | `memory-core/config.template.mjs:161` | Tier 1 | Shared provider block value; also runtime host binding for local providers. Tier 1 default with env override. |
| `NEO_OPENAI_COMPATIBLE_KEEP_ALIVE` | `memory-core/config.template.mjs:468` | Tier 1 | Shared provider request-retention value. Default `-1`; env override supports shorter windows or `0` unload control. |
| `NEO_OPENAI_COMPATIBLE_MODEL` | `memory-core/config.template.mjs:162` | Tier 1 | Shared provider block value. Tier 1 default plus optional env override. |
| `NEO_PUBLIC_URL` | `shared/helpers/DeploymentConfig.mjs:119`; `memory-core/config.template.mjs:113`; `knowledge-base/config.template.mjs:58` | Tier 3 | Runtime binding for externally advertised MCP URL behind reverse proxies. |
| `NEO_RLAIF_PATH` | `memory-core/config.template.mjs:269` | Tier 2 | Dataset path. Prefer Memory Core config; env override only if operator path injection is needed. |
| `NEO_SESSION_ID` | `knowledge-base/Server.mjs:190`; `knowledge-base/services/toolService.mjs:43` | Tier 3 | Session identity binding for KB telemetry/request context fallback. |
| `NEO_VECTOR_DIMENSION` | `memory-core/config.template.mjs:171` | Tier 1 | Shared embedding/vector contract. Tier 1 default plus optional env override only during controlled migrations. |
| `NEO_OAUTH_CLIENT_ID` | `memory-core/config.template.mjs:129`; `knowledge-base/config.template.mjs:74` | Tier 3 | Deployment/runtime auth binding. |
| `NEO_OAUTH_CLIENT_SECRET` | `memory-core/config.template.mjs:130`; `knowledge-base/config.template.mjs:75` | Tier 3 | Secret. Must stay env-backed. |
| `NEO_REAL_TIME_MEMORY_PARSING` | `memory-core/config.template.mjs:80` | Tier 3 | Operator one-shot/daemon toggle; keep opt-in env to prevent accidental graph writes. |
| `NEO_SESSION_COLLECTION_NAME` | `memory-core/config.template.mjs:260` | Tier 2 | Collection name default; move to per-server config unless deployment override remains necessary. |
| `SSE_PORT` | `shared/helpers/DeploymentConfig.mjs:37` | Delete | Legacy dev-branch-only alias targeted by #10823. |
| `NEO_TRANSPORT` | `memory-core/config.template.mjs:95`; `knowledge-base/config.template.mjs:40` | Tier 3 | Runtime binding for stdio vs SSE server mode. |
| `USER` | `knowledge-base/Server.mjs:189,191`; `knowledge-base/services/KBRecorderService.mjs:202`; `knowledge-base/services/toolService.mjs:42` | Tier 3 | Host identity fallback. Keep as fallback only while request-bound identity migration remains incomplete. |

## Count Summary

| Target bucket | Count | Notes |
|---|---:|---|
| Tier 1 shared config default plus optional env override | 10 | Provider/model/vector globals that Phase 1.5 should move to `ai/config.template.mjs`. |
| Tier 2 per-server config | 15 | Collection names, daemon tuning, local paths, and service-specific knobs. |
| Tier 3 `.env` keep-list | 28 | Secrets, runtime binding, identity binding, single-writer role, multi-tenant isolation, and operator one-shot toggles. |
| Delete | 5 | Includes #10823 aliases plus NEO_MEMORY_CORE_DB_PATH follow-up deletion candidates. |
| Removed in v13 | 1 | NEO_CHROMA_UNIFIED retired per #11011. |
| Defer to #10825 or Phase 1.5 | 3 | Diagnostic-only Chroma hint vars and generic `HOST` fallback. |

## Follow-Up Notes

- #10823 should consume the delete rows for `SSE_PORT`, `NEO_CHROMA_EMBEDDING_PROVIDER`, `NEO_KB_CHROMA_HOST`, and `NEO_KB_CHROMA_PORT` only after Phase 1.5 config activation satisfies #10822 AC14.
- `NEO_MEMORY_CORE_DB_PATH` is another alias-like fallback found by the audit. It is not in #10823 today and should either be added there or filed as a narrow sibling once ownership is clear.
- `CHROMA_DATA_PATH`, `CHROMA_PORT`, and bare `HOST` are not legacy aliases in the same sense; they need #10825 or Phase 1.5 review before removal.
