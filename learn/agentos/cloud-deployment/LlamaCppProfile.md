# Cloud Deployment - llama.cpp Profile

> **Status - operator profile.** This guide documents llama.cpp as a self-hosted
> OpenAI-compatible backend for Agent OS cloud deployments. It turns Neo's
> generic provider-readiness substrate into a backend-specific handoff profile
> operators can run before assigning agents to the deployment.

## Provider selector

Use Neo's existing OpenAI-compatible provider keys. Do not introduce or document
a `llamaCpp` provider selector unless implementation evidence proves that the
generic OpenAI-compatible contract is insufficient.

```bash
export NEO_MODEL_PROVIDER=openAiCompatible
export NEO_EMBEDDING_PROVIDER=openAiCompatible
export NEO_GRAPH_PROVIDER=openAiCompatible
```

This means llama.cpp must present the routes Neo already consumes:

| Role | Neo path | llama.cpp-facing route |
|---|---|---|
| Chat / summaries | `Neo.ai.provider.OpenAiCompatible` | `/v1/chat/completions` |
| Embeddings / KB + MC vectors | `TextEmbeddingService` OpenAI-compatible mode | `/v1/embeddings` |
| Capacity visibility | `ProviderReadinessHelper` | `/v1/models` |

## Residency invariant

Agent OS local-model deployments are valid only when chat and embedding roles can
remain available together. A deployment that succeeds on one chat request, then
evicts or rebuilds before the next embedding request, is not an Agent OS-ready
local Brain deployment.

The handoff rule is:

```text
chat model resident + embedding model resident + role smoke passes without
model swapping/context rebuilds
```

If that cannot be proven, use a remote provider, a different local backend, or
land a provider-role-host implementation before handing the deployment to
agents.

## Supported topology

Neo currently exposes one `openAiCompatible` base URL through
`NEO_OPENAI_COMPATIBLE_HOST`. For llama.cpp, the supported deployment shape is
therefore a single OpenAI-compatible base URL that can serve both configured
role models:

- one llama.cpp endpoint or router that advertises both configured model ids
  through `/v1/models` and routes requests to the correct resident role model;
  or
- multiple role-specific `llama-server` processes behind one operator-owned
  OpenAI-compatible router/reverse proxy that preserves `/v1/models`,
  `/v1/chat/completions`, and `/v1/embeddings`.

Do not hide two unrelated llama.cpp hosts behind one Neo config by manually
switching `NEO_OPENAI_COMPATIBLE_HOST` between calls. That recreates the
model-swap failure this profile is meant to prevent.

If your only safe llama.cpp topology requires separate chat and embedding hosts
with no shared OpenAI-compatible router, current Neo config cannot express that
cleanly. Keep that topology out of production until Neo supports role-specific
OpenAI-compatible hosts instead of documenting a manual operator workaround.

## Environment example

Pin model names and context bands to the actually loaded GGUF models. The values
below are placeholders, not portable defaults.

```bash
export NEO_OPENAI_COMPATIBLE_HOST=http://llama-router:8080
export NEO_OPENAI_COMPATIBLE_API_KEY=

export NEO_OPENAI_COMPATIBLE_MODEL="<chat-model-id>"
export NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL="<embedding-model-id>"
export NEO_OPENAI_COMPATIBLE_KEEP_ALIVE=-1
export NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS=2

export NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS="<chat-model-context>"
export NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS="<safe-chat-band>"
export NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS="<embedding-model-window>"
export NEO_LOCAL_MODELS_EMBEDDING_SAFE_PROCESSING_LIMIT_TOKENS="<safe-embedding-band>"
export NEO_VECTOR_DIMENSION="<embedding-vector-dimension>"
```

`NEO_OPENAI_COMPATIBLE_REQUIRE_PARALLEL_MODELS=2` is the important handoff
contract: Neo should warn when the OpenAI-compatible provider cannot observe the
configured chat and embedding models as available together. A warning here is a
deployment-readiness failure, not cosmetic noise.

The embedding context values must describe the embedding model's real input
window. Do not shrink them to a generic tiny default if the deployment expects
large-file KB ingestion; do not inflate them beyond the model's actual capacity
to silence preflight checks.

## llama.cpp server smoke

Verify the current llama.cpp server flags against the official
[`llama-server` documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
for the version you deploy. The smoke below intentionally checks HTTP behavior
rather than fossilizing startup flags.

```bash
export LLAMA_BASE_URL="${NEO_OPENAI_COMPATIBLE_HOST}"

curl -fsS "$LLAMA_BASE_URL/health"
curl -fsS "$LLAMA_BASE_URL/v1/models"
```

`/v1/models` must show the configured chat model id and embedding model id, or
the deployment has not proven the dual-role residency contract.

Then prove each role:

```bash
curl -fsS "$LLAMA_BASE_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "<chat-model-id>",
    "messages": [{"role": "user", "content": "Return the word ok."}],
    "max_tokens": 4
  }'

curl -fsS "$LLAMA_BASE_URL/v1/embeddings" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "<embedding-model-id>",
    "input": "Agent OS embedding smoke"
  }'
```

Check runtime pressure when the server exposes the surfaces:

```bash
curl -fsS "$LLAMA_BASE_URL/slots"
curl -fsS "$LLAMA_BASE_URL/metrics"
```

The slots endpoint is useful for confirming that role traffic is not constantly
overwriting the only useful cache slot. Metrics are optional and depend on how
the operator starts llama.cpp; absence of `/metrics` is acceptable only when the
deployment deliberately runs without Prometheus exposure.

## Neo handoff smoke

After the backend smoke passes, verify the Neo-facing surfaces:

1. Run the Memory Core `healthcheck` and confirm `providers.summary` points at
   `openAiCompatible`, the llama.cpp base URL, and the configured chat model.
2. Confirm `providers.embedding` points at `openAiCompatible`, the same base URL,
   the configured embedding model, and the expected vector dimension.
3. Start an orchestrator cycle only after provider-readiness warnings are gone.
4. Run one summary-sized chat call and one KB/MC embedding call without changing
   any provider env vars between them.

Do not treat container health, `/health`, or an embeddings-only proof as enough.
The deployment is ready for agents only after the chat role, embedding role, and
Neo health/readiness surfaces all agree.

## Failure signatures

| Signature | Meaning | Operator action |
|---|---|---|
| `/v1/models` lists only one role model | llama.cpp has not exposed both role models through the Neo base URL | Add a router/shared endpoint or change backend topology before handoff. |
| Chat works but embeddings fail | The endpoint is chat-only or embedding model/dimension config is wrong | Fix embedding model id, embedding mode, and `NEO_VECTOR_DIMENSION`. |
| Embeddings work but chat fails | The endpoint is embedding-only or chat model id/template is wrong | Fix chat model id and llama.cpp chat-template/runtime config. |
| Role calls trigger model reloads | The deployment serializes roles instead of keeping them resident | Reject the topology for Agent OS local-model use. |
| Vector dimension mismatch | Chroma receives vectors with the wrong width | Set `NEO_VECTOR_DIMENSION` to the embedding model's actual output dimension and rebuild affected collections if needed. |
| `NEO_MODEL_PROVIDER=llamaCpp` | The docs/config invented a provider key Neo does not implement | Use `openAiCompatible` or land a separate provider implementation first. |

## Related

- [Day-0 Tutorial](./Day0Tutorial.md) - first-run cloud deployment proof.
- [Configuration](./Configuration.md) - deployment config surface and provider-readiness env vars.
- [Deployment Cookbook](../DeploymentCookbook.md) - broader Agent OS deployment topology.
- [Shared KB/MC Team Deployment](../SharedDeployment.md) - shared local-provider residency guidance.
