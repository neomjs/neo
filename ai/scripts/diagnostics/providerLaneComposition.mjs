import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/**
 * @module ai/scripts/diagnostics/providerLaneComposition
 * @summary Turns rendered Compose JSON into the stable, machine-readable provider-lane receipt
 * consumed by the fixed-envelope election. The analyzer owns Compose knowledge; downstream code
 * consumes only the receipt and {@link validateProviderLaneCompositionReceipt}, so service/env
 * conventions never become a second authority in the election runner.
 *
 * @example
 * docker compose -f ai/deploy/docker-compose.yml \
 *   -f ai/deploy/docker-compose.provider-lanes.yml --profile cloud config --format json \
 * | node ai/scripts/diagnostics/providerLaneComposition.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION = 'provider-lane-composition.v1';
export const PROVIDER_LANE_KEYS                        = Object.freeze(['chat', 'embedding']);
export const PROVIDER_LANE_ROLE_KEYS                   = Object.freeze(['model', 'graph', 'kbAskSynthesis', 'embedding']);
export const PROVIDER_LANE_SERVICE_KEYS                = Object.freeze({chat: 'chat-model', embedding: 'embedding-model'});
export const PROVIDER_LANE_BASE_URLS                   = Object.freeze({chat: 'http://chat-model:11434', embedding: 'http://embedding-model:8080'});
export const PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS       = Object.freeze({
    totalCpuCores                        : 'NEO_PROVIDER_LANES_CPU_TOTAL',
    totalMemoryBytes                     : 'NEO_PROVIDER_LANES_MEMORY_BYTES_TOTAL',
    chatCpuCores                         : 'NEO_PROVIDER_LANE_CHAT_CPUS',
    chatMemoryBytes                      : 'NEO_PROVIDER_LANE_CHAT_MEMORY_BYTES',
    chatContextTokens                    : 'NEO_PROVIDER_LANE_CHAT_CONTEXT_TOKENS',
    embeddingCpuCores                    : 'NEO_PROVIDER_LANE_EMBEDDING_CPUS',
    embeddingMemoryBytes                 : 'NEO_PROVIDER_LANE_EMBEDDING_MEMORY_BYTES',
    embeddingParallelSlots               : 'NEO_PROVIDER_LANE_EMBEDDING_SLOTS',
    embeddingTotalContextTokens          : 'NEO_PROVIDER_LANE_EMBEDDING_TOTAL_CONTEXT_TOKENS',
    embeddingContextTokensPerSlotRequired: 'NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED',
    embeddingBatchTokens                 : 'NEO_PROVIDER_LANE_EMBEDDING_BATCH_TOKENS',
    embeddingUbatchTokens                : 'NEO_PROVIDER_LANE_EMBEDDING_UBATCH_TOKENS'
});
export const PROVIDER_LANE_MODEL_CONTRACT               = Object.freeze({
    chat: Object.freeze({
        id              : 'gemma4:26b',
        coordinate      : 'ollama://registry.ollama.ai/library/gemma4:26b@sha256:5571076f3d70050487b26b341705799e0ab29b808164f90d20d4cf84f699d251',
        digest          : 'sha256:7121486771cbfe218851513210c40b35dbdee93ab1ef43fe36283c883980f0df',
        digestKind      : 'ollama-model-weights',
        contextTokensMax: 262144
    }),
    embedding: Object.freeze({
        // Supported sequence ceiling from the exact pinned model card. The raw GGUF positional
        // metadata is 40960; receipt consumers must not reinterpret that as a supported workload.
        id              : 'qwen3-embedding-8b',
        coordinate      : 'hf://Qwen/Qwen3-Embedding-8B-GGUF@69d0e58a13e463cd99a9b83e3f5fee7c10265fab/Qwen3-Embedding-8B-Q4_K_M.gguf',
        digest          : 'sha256:3fcd3febec8b3fd64435204db75bf0dd73b91e8d0661e0331acfe7e7c3120b85',
        digestKind      : 'gguf-file',
        contextTokensMax: 32768
    })
});
export const PROVIDER_LANE_ROLE_CONTRACT               = Object.freeze({
    model         : Object.freeze({configPath: 'modelProvider', lane: 'chat'}),
    graph         : Object.freeze({configPath: 'graphProvider', lane: 'chat'}),
    kbAskSynthesis: Object.freeze({configPath: 'knowledgeBase.askSynthesis.provider', lane: 'chat'}),
    embedding     : Object.freeze({configPath: 'embeddingProvider', lane: 'embedding'})
});

/**
 * @summary Immutable endpoint protocol consumed by the receipt-only election boundary.
 * @type {Object}
 */
export const PROVIDER_LANE_ENDPOINT_CONTRACT = Object.freeze({
    chat: Object.freeze({
        workload: Object.freeze({
            kind      : 'ollamaChat',
            method    : 'POST',
            path      : '/api/chat',
            inputField: 'messages',
            modelField: 'model'
        }),
        modelContext: Object.freeze({
            kind              : 'ollamaRunningModels',
            method            : 'GET',
            path              : '/api/ps',
            modelIdField      : 'name',
            contextTokensField: 'context_length'
        })
    }),
    embedding: Object.freeze({
        workload: Object.freeze({
            kind      : 'openAiEmbeddings',
            method    : 'POST',
            path      : '/v1/embeddings',
            inputField: 'input',
            modelField: 'model'
        }),
        readiness: Object.freeze({
            method: 'GET',
            path  : '/health'
        }),
        models: Object.freeze({
            method: 'GET',
            path  : '/v1/models'
        }),
        slotContext: Object.freeze({
            kind              : 'llamaCppSlots',
            method            : 'GET',
            path              : '/slots',
            slotIdField       : 'id',
            contextTokensField: 'n_ctx',
            processingField   : 'is_processing'
        })
    })
});

/**
 * @summary Current production consumers, each bound to exactly one provider role and one source
 * anchor. The profile repeats only the ids; this executable table owns their provenance.
 * @type {Object[]}
 */
export const PROVIDER_LANE_CONSUMER_CENSUS = Object.freeze([
    {id: 'memory-session-summary', role: 'model', source: 'ai/services/memory-core/SessionService.mjs', anchor: 'this.model = buildChatModel({'},
    {id: 'memory-mini-summary', role: 'model', source: 'ai/services/memory-core/MemoryService.mjs', anchor: 'const model = buildModel({'},
    {id: 'concept-discovery', role: 'graph', source: 'ai/services/ingestion/ConceptDiscoveryService.mjs', anchor: 'const graphProvider = resolveGraphModelProvider(aiConfig);'},
    {id: 'semantic-graph', role: 'graph', source: 'ai/services/graph/SemanticGraphExtractor.mjs', anchor: 'const graphProvider = resolveGraphModelProvider(AiConfig);'},
    {id: 'topology-inference', role: 'graph', source: 'ai/services/graph/TopologyInferenceEngine.mjs', anchor: 'resolveGraphModelProvider(AiConfig)'},
    {id: 'golden-path-brief', role: 'graph', source: 'ai/services/graph/GoldenPathSynthesizer.mjs', anchor: 'const graphProvider = resolveGraphModelProvider(aiConfig);'},
    {id: 'dream-readiness', role: 'graph', source: 'ai/daemons/orchestrator/services/DreamService.mjs', anchor: "if (aiConfig.graphProvider === 'openAiCompatible')"},
    {id: 'inference-lifecycle-readiness', role: 'graph', source: 'ai/services/memory-core/lifecycle/InferenceLifecycleService.mjs', anchor: 'getGraphProviderReadinessTarget(aiConfig)'},
    {id: 'knowledge-base-ask', role: 'kbAskSynthesis', source: 'ai/services/knowledge-base/SearchService.mjs', anchor: 'buildAskChatModelOptions(aiConfig'},
    {id: 'kb-query', role: 'embedding', source: 'ai/services/knowledge-base/QueryService.mjs', anchor: 'TextEmbeddingService.embedText(query, mcConfig.embeddingProvider'},
    {id: 'kb-tenant-ingestion', role: 'embedding', source: 'ai/services/knowledge-base/VectorService.mjs', anchor: 'TextEmbeddingService.embedTexts(textsToEmbed, mcConfig.embeddingProvider'},
    {id: 'kb-health-canary', role: 'embedding', source: 'ai/services/knowledge-base/HealthService.mjs', anchor: 'TextEmbeddingService.embedText(text, explicitProvider, options)'},
    {id: 'mc-vector-collections', role: 'embedding', source: 'ai/services/shared/vector/chromaClientPrimitives.mjs', anchor: 'TextEmbeddingService.embedTexts(texts, provider'},
    {id: 'mc-health-canary', role: 'embedding', source: 'ai/services/memory-core/HealthService.mjs', anchor: 'TextEmbeddingService.embedText(text, explicitProvider, options)'},
    {id: 'golden-path-frontier', role: 'embedding', source: 'ai/services/graph/GoldenPathSynthesizer.mjs', anchor: 'TextEmbeddingService.embedText(frontierText, aiConfig.embeddingProvider)'},
    {id: 'orchestrator-recovery', role: 'embedding', source: 'ai/daemons/orchestrator/Orchestrator.mjs', anchor: 'TextEmbeddingService.embedTexts(documents, AiConfig.embeddingProvider)'},
    {id: 'tenant-repo-recovery', role: 'embedding', source: 'ai/daemons/orchestrator/services/TenantRepoSyncService.mjs', anchor: 'TextEmbeddingService.embedText(text, explicitProvider, options)'},
    {id: 'vector-maintenance', role: 'embedding', source: 'ai/scripts/maintenance/defragChromaDB.mjs', anchor: 'TextEmbeddingService.embedTexts(docs.map'}
]);

function numberAboveZero(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null
}

function integerAboveZero(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null
}

function bytes(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null
}

function sorted(values) {
    return [...values].sort((left, right) => left.localeCompare(right))
}

function sameSet(left = [], right = []) {
    return JSON.stringify(sorted(new Set(left))) === JSON.stringify(sorted(new Set(right)))
}

function normalizeEnvironment(service) {
    const raw = service?.environment;
    if (!raw) return {};
    if (!Array.isArray(raw)) return raw;

    return Object.fromEntries(raw.filter(value => typeof value === 'string').map(value => {
        const separator = value.indexOf('=');
        return separator < 0 ? [value, ''] : [value.slice(0, separator), value.slice(separator + 1)]
    }))
}

function imageIdentity(value) {
    const match = typeof value === 'string' && value.match(/^(.+)@(sha256:[a-f0-9]{64})$/);
    return match ? {reference: match[1], digest: match[2]} : {reference: value || null, digest: null}
}

function isSha256(value) {
    return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
}

function joinUrl(baseUrl, pathName) {
    return typeof baseUrl === 'string' && typeof pathName === 'string'
        ? `${baseUrl.replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}`
        : null
}

function endpointReceipt(endpoint = {}) {
    const {baseUrl, path: pathName, ...rest} = endpoint;
    return {...rest, url: joinUrl(baseUrl, pathName)}
}

function endpointHost(endpoint) {
    try {
        return new URL(endpoint?.url).hostname
    } catch {
        return null
    }
}

/**
 * @summary Parses a receipt URL without throwing so malformed evidence becomes a validation error.
 * @param {*} value Candidate URL.
 * @returns {URL|null}
 */
function parsedUrl(value) {
    try {
        return new URL(value)
    } catch {
        return null
    }
}

function healthcheckText(service) {
    const test = service?.healthcheck?.test;
    return Array.isArray(test) ? test.join('\n') : String(test ?? '')
}

function commandText(service) {
    const command = service?.command;
    return Array.isArray(command) ? command.join('\n') : String(command || '')
}

function makeError(code, pathName, expected, actual) {
    return {
        code,
        path    : pathName,
        expected: expected === undefined ? null : expected,
        actual  : actual === undefined ? null : actual
    }
}

function assertValue(errors, condition, code, pathName, expected, actual) {
    if (!condition) errors.push(makeError(code, pathName, expected, actual));
}

function laneReceipt(name, declaration = {}) {
    const workload = endpointReceipt(declaration.endpoints?.workload);

    return {
        serviceKey: declaration.service || null,
        dnsName   : endpointHost(workload),
        baseUrl   : declaration.endpoints?.workload?.baseUrl || null,
        provider  : declaration.provider || null,
        image     : imageIdentity(declaration.image),
        model     : {
            id              : declaration.model?.id || null,
            coordinate      : declaration.model?.coordinate || null,
            digest          : declaration.model?.digest || null,
            digestKind      : name === 'chat' ? 'ollama-model-weights' : 'gguf-file',
            contextTokensMax: integerAboveZero(declaration.model?.contextTokensMax)
        },
        cpuCores                    : numberAboveZero(declaration.cpus),
        memoryBytes                 : bytes(declaration.memoryBytes),
        parallelSlots               : integerAboveZero(declaration.slots),
        totalContextTokens          : integerAboveZero(declaration.totalContextTokens),
        contextTokensPerSlotRequired: integerAboveZero(declaration.contextTokensPerSlotRequired),
        ...(name === 'embedding' ? {
            batchTokens : integerAboveZero(declaration.batchTokens),
            ubatchTokens: integerAboveZero(declaration.ubatchTokens)
        } : {}),
        endpoints                   : Object.fromEntries(Object.entries(declaration.endpoints || {}).map(([key, value]) => [key, endpointReceipt(value)]))
    }
}

function roleReceipt(name, declaration = {}, lanes = {}) {
    const lane = lanes[declaration.lane];
    return {
        configPath: declaration.configPath || null,
        lane      : declaration.lane || null,
        serviceKey: lane?.serviceKey || null,
        provider  : declaration.provider || null,
        modelId   : declaration.model || null,
        baseUrl   : lane?.baseUrl || null,
        consumers : Array.isArray(declaration.consumers) ? [...declaration.consumers] : [],
        roleKey   : name
    }
}

/**
 * @summary Validates the stable receipt without reading Compose or the repository. This is the only
 * executable contract consumed by runtime election and admission tooling.
 * @param {Object} receipt Provider-lane receipt.
 * @param {Object} [options]
 * @param {Boolean} [options.requireReady=true] Analyzer sets false while deriving final readiness.
 * @returns {{valid: Boolean, errors: Object[]}}
 */
export function validateProviderLaneCompositionReceipt(receipt, {requireReady = true} = {}) {
    const errors = [];
    const fail   = (condition, code, pathName, expected, actual) =>
        assertValue(errors, condition, code, pathName, expected, actual);

    const receiptFields = [
        'composeProject',
        'consumerCensus',
        'deploymentInputs',
        'envelope',
        'errors',
        'lanes',
        'ready',
        'roles',
        'schemaVersion'
    ];

    fail(sameSet(Object.keys(receipt || {}), receiptFields), 'receipt-field-set',
        'receipt', receiptFields, Object.keys(receipt || {}));

    fail(receipt?.schemaVersion === PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION,
        'schema-version', 'schemaVersion', PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION, receipt?.schemaVersion);
    if (requireReady) {
        fail(receipt?.ready === true, 'receipt-not-ready', 'ready', true, receipt?.ready);
        fail(Array.isArray(receipt?.errors) && receipt.errors.length === 0,
            'receipt-errors', 'errors', [], receipt?.errors)
    }
    fail(typeof receipt?.composeProject === 'string' && receipt.composeProject.length > 0 &&
        receipt.composeProject.length <= 128, 'compose-project', 'composeProject', 'bounded nonempty string', receipt?.composeProject);
    fail(JSON.stringify(receipt?.consumerCensus) === JSON.stringify(PROVIDER_LANE_CONSUMER_CENSUS),
        'consumer-census', 'consumerCensus', PROVIDER_LANE_CONSUMER_CENSUS, receipt?.consumerCensus);

    const envelope = receipt?.envelope || {};
    fail(sameSet(Object.keys(envelope), ['allocations', 'scope', 'total']),
        'envelope-field-set', 'envelope', ['allocations', 'scope', 'total'], Object.keys(envelope));
    fail(envelope.scope === 'provider-runtimes', 'envelope-scope', 'envelope.scope', 'provider-runtimes', envelope.scope);
    fail(sameSet(Object.keys(envelope.total || {}), ['cpuCores', 'memoryBytes']),
        'envelope-total-field-set', 'envelope.total', ['cpuCores', 'memoryBytes'], Object.keys(envelope.total || {}));
    fail(sameSet(Object.keys(envelope.allocations || {}), PROVIDER_LANE_KEYS),
        'envelope-allocation-set', 'envelope.allocations', PROVIDER_LANE_KEYS, Object.keys(envelope.allocations || {}));
    for (const laneName of PROVIDER_LANE_KEYS) {
        fail(sameSet(Object.keys(envelope.allocations?.[laneName] || {}), ['cpuCores', 'memoryBytes']),
            'envelope-allocation-field-set', `envelope.allocations.${laneName}`,
            ['cpuCores', 'memoryBytes'], Object.keys(envelope.allocations?.[laneName] || {}))
    }

    const lanes = receipt?.lanes || {};
    fail(sameSet(Object.keys(lanes), PROVIDER_LANE_KEYS), 'lane-set', 'lanes', PROVIDER_LANE_KEYS, Object.keys(lanes));

    for (const laneName of PROVIDER_LANE_KEYS) {
        const lane          = lanes[laneName] || {};
        const expectedModel = PROVIDER_LANE_MODEL_CONTRACT[laneName];
        const laneFields    = [
            'baseUrl',
            'contextTokensPerSlotRequired',
            'cpuCores',
            'dnsName',
            'endpoints',
            'image',
            'memoryBytes',
            'model',
            'parallelSlots',
            'provider',
            'serviceKey',
            'totalContextTokens',
            ...(laneName === 'embedding' ? ['batchTokens', 'ubatchTokens'] : [])
        ];
        fail(sameSet(Object.keys(lane), laneFields), 'lane-field-set',
            `lanes.${laneName}`, laneFields, Object.keys(lane));
        fail(sameSet(Object.keys(lane.image || {}), ['digest', 'reference']), 'image-field-set',
            `lanes.${laneName}.image`, ['digest', 'reference'], Object.keys(lane.image || {}));
        fail(lane.serviceKey === PROVIDER_LANE_SERVICE_KEYS[laneName], 'service-key', `lanes.${laneName}.serviceKey`, PROVIDER_LANE_SERVICE_KEYS[laneName], lane.serviceKey);
        fail(lane.dnsName === lane.serviceKey, 'lane-dns', `lanes.${laneName}.dnsName`, lane.serviceKey, lane.dnsName);
        fail(isSha256(lane.image?.digest), 'image-digest', `lanes.${laneName}.image.digest`, 'sha256:<64hex>', lane.image?.digest);
        fail(isSha256(lane.model?.digest), 'model-digest', `lanes.${laneName}.model.digest`, 'sha256:<64hex>', lane.model?.digest);
        fail(typeof lane.model?.coordinate === 'string' && lane.model.coordinate.includes('@'), 'model-coordinate', `lanes.${laneName}.model.coordinate`, 'immutable coordinate containing @', lane.model?.coordinate);
        fail(sameSet(Object.keys(lane.model || {}), Object.keys(expectedModel)), 'model-field-set', `lanes.${laneName}.model`, Object.keys(expectedModel), Object.keys(lane.model || {}));
        for (const [field, expectedValue] of Object.entries(expectedModel)) {
            fail(lane.model?.[field] === expectedValue, 'model-contract', `lanes.${laneName}.model.${field}`, expectedValue, lane.model?.[field]);
        }
        fail(numberAboveZero(lane.cpuCores) !== null, 'lane-cpus', `lanes.${laneName}.cpuCores`, 'positive number', lane.cpuCores);
        fail(bytes(lane.memoryBytes) !== null, 'lane-memory', `lanes.${laneName}.memoryBytes`, 'positive integer bytes', lane.memoryBytes);
        fail(integerAboveZero(lane.parallelSlots) !== null, 'lane-slots', `lanes.${laneName}.parallelSlots`, 'positive integer', lane.parallelSlots);
        fail(integerAboveZero(lane.totalContextTokens) !== null, 'lane-total-context', `lanes.${laneName}.totalContextTokens`, 'positive integer', lane.totalContextTokens);
        fail(integerAboveZero(lane.contextTokensPerSlotRequired) !== null, 'lane-slot-context', `lanes.${laneName}.contextTokensPerSlotRequired`, 'positive integer', lane.contextTokensPerSlotRequired);
        fail(lane.totalContextTokens >= lane.parallelSlots * lane.contextTokensPerSlotRequired,
            'context-allocation', `lanes.${laneName}.totalContextTokens`, `>= parallelSlots * contextTokensPerSlotRequired (${lane.parallelSlots * lane.contextTokensPerSlotRequired})`, lane.totalContextTokens);
        fail(lane.contextTokensPerSlotRequired <= expectedModel.contextTokensMax,
            'model-context-ceiling', `lanes.${laneName}.contextTokensPerSlotRequired`, `<= model.contextTokensMax (${expectedModel.contextTokensMax})`, lane.contextTokensPerSlotRequired);
        fail(lane.totalContextTokens <= lane.parallelSlots * expectedModel.contextTokensMax,
            'model-total-context-ceiling', `lanes.${laneName}.totalContextTokens`, `<= parallelSlots * model.contextTokensMax (${lane.parallelSlots * expectedModel.contextTokensMax})`, lane.totalContextTokens);

        const endpointContract  = PROVIDER_LANE_ENDPOINT_CONTRACT[laneName];
        const receiptEndpoints  = lane.endpoints || {};
        const expectedEndpoints = Object.keys(endpointContract);
        const expectedBaseUrl   = PROVIDER_LANE_BASE_URLS[laneName];

        fail(lane.baseUrl === expectedBaseUrl, 'lane-base-url', `lanes.${laneName}.baseUrl`, expectedBaseUrl, lane.baseUrl);
        fail(sameSet(Object.keys(receiptEndpoints), expectedEndpoints), 'endpoint-set', `lanes.${laneName}.endpoints`, expectedEndpoints, Object.keys(receiptEndpoints));

        for (const [endpointName, expected] of Object.entries(endpointContract)) {
            const endpoint       = receiptEndpoints[endpointName] || {};
            const endpointUrl    = parsedUrl(endpoint.url);
            const expectedUrl    = joinUrl(expectedBaseUrl, expected.path);
            const expectedFields = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'path'));

            fail(endpointUrl?.hostname === lane.serviceKey, 'endpoint-host', `lanes.${laneName}.endpoints.${endpointName}.url`, lane.serviceKey, endpointUrl?.hostname || endpoint.url);
            fail(endpoint.url === expectedUrl, 'endpoint-url', `lanes.${laneName}.endpoints.${endpointName}.url`, expectedUrl, endpoint.url);
            fail(sameSet(Object.keys(endpoint), ['url', ...Object.keys(expectedFields)]), 'endpoint-field-set', `lanes.${laneName}.endpoints.${endpointName}`, ['url', ...Object.keys(expectedFields)], Object.keys(endpoint));

            for (const [field, expectedValue] of Object.entries(expectedFields)) {
                fail(endpoint[field] === expectedValue, 'endpoint-contract', `lanes.${laneName}.endpoints.${endpointName}.${field}`, expectedValue, endpoint[field]);
            }
        }
    }

    fail(lanes.chat?.parallelSlots === 1, 'chat-parallelism', 'lanes.chat.parallelSlots', 1, lanes.chat?.parallelSlots);
    fail(integerAboveZero(lanes.embedding?.batchTokens) !== null,
        'embedding-batch', 'lanes.embedding.batchTokens', 'positive integer', lanes.embedding?.batchTokens);
    fail(integerAboveZero(lanes.embedding?.ubatchTokens) !== null,
        'embedding-ubatch', 'lanes.embedding.ubatchTokens', 'positive integer', lanes.embedding?.ubatchTokens);
    fail(lanes.embedding?.batchTokens === lanes.embedding?.ubatchTokens,
        'embedding-batch-ubatch-coupling', 'lanes.embedding.batchTokens',
        '=== lanes.embedding.ubatchTokens', lanes.embedding?.batchTokens);
    fail(lanes.embedding?.ubatchTokens === lanes.embedding?.totalContextTokens,
        'embedding-batch-context-coupling', 'lanes.embedding.ubatchTokens',
        '=== lanes.embedding.totalContextTokens', lanes.embedding?.ubatchTokens);
    fail(lanes.chat?.serviceKey !== lanes.embedding?.serviceKey, 'lane-collapse', 'lanes', 'distinct service keys', lanes.chat?.serviceKey);
    fail(lanes.chat?.provider !== lanes.embedding?.provider, 'provider-collapse', 'lanes', 'distinct provider families', lanes.chat?.provider);
    const total       = receipt?.envelope?.total || {};
    const allocations = receipt?.envelope?.allocations || {};
    fail(total.cpuCores === lanes.chat?.cpuCores + lanes.embedding?.cpuCores, 'cpu-envelope-sum', 'envelope.total.cpuCores', lanes.chat?.cpuCores + lanes.embedding?.cpuCores, total.cpuCores);
    fail(total.memoryBytes === lanes.chat?.memoryBytes + lanes.embedding?.memoryBytes, 'memory-envelope-sum', 'envelope.total.memoryBytes', lanes.chat?.memoryBytes + lanes.embedding?.memoryBytes, total.memoryBytes);
    for (const laneName of PROVIDER_LANE_KEYS) {
        fail(allocations[laneName]?.cpuCores === lanes[laneName]?.cpuCores, 'allocation-cpu-drift', `envelope.allocations.${laneName}.cpuCores`, lanes[laneName]?.cpuCores, allocations[laneName]?.cpuCores);
        fail(allocations[laneName]?.memoryBytes === lanes[laneName]?.memoryBytes, 'allocation-memory-drift', `envelope.allocations.${laneName}.memoryBytes`, lanes[laneName]?.memoryBytes, allocations[laneName]?.memoryBytes);
    }

    const deploymentInputs         = receipt?.deploymentInputs || {};
    const expectedDeploymentInputs = {
        totalCpuCores                        : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.totalCpuCores, value: total.cpuCores},
        totalMemoryBytes                     : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.totalMemoryBytes, value: total.memoryBytes},
        chatCpuCores                         : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.chatCpuCores, value: lanes.chat?.cpuCores},
        chatMemoryBytes                      : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.chatMemoryBytes, value: lanes.chat?.memoryBytes},
        chatContextTokens                    : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.chatContextTokens, value: lanes.chat?.totalContextTokens},
        embeddingCpuCores                    : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingCpuCores, value: lanes.embedding?.cpuCores},
        embeddingMemoryBytes                 : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingMemoryBytes, value: lanes.embedding?.memoryBytes},
        embeddingParallelSlots               : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingParallelSlots, value: lanes.embedding?.parallelSlots},
        embeddingTotalContextTokens          : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingTotalContextTokens, value: lanes.embedding?.totalContextTokens},
        embeddingContextTokensPerSlotRequired: {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingContextTokensPerSlotRequired, value: lanes.embedding?.contextTokensPerSlotRequired},
        embeddingBatchTokens                 : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingBatchTokens, value: lanes.embedding?.batchTokens},
        embeddingUbatchTokens                : {env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS.embeddingUbatchTokens, value: lanes.embedding?.ubatchTokens}
    };

    fail(sameSet(Object.keys(deploymentInputs), Object.keys(expectedDeploymentInputs)), 'deployment-input-set',
        'deploymentInputs', Object.keys(expectedDeploymentInputs), Object.keys(deploymentInputs));
    for (const [key, expected] of Object.entries(expectedDeploymentInputs)) {
        const actual = deploymentInputs[key] || {};
        fail(sameSet(Object.keys(actual), ['env', 'value']), 'deployment-input-field-set', `deploymentInputs.${key}`, ['env', 'value'], Object.keys(actual));
        fail(actual.env === expected.env, 'deployment-input-env', `deploymentInputs.${key}.env`, expected.env, actual.env);
        fail(actual.value === expected.value, 'deployment-input-value', `deploymentInputs.${key}.value`, expected.value, actual.value);
    }

    const roles = receipt?.roles || {};
    fail(sameSet(Object.keys(roles), PROVIDER_LANE_ROLE_KEYS), 'role-set', 'roles', PROVIDER_LANE_ROLE_KEYS, Object.keys(roles));
    const seenConsumers = new Map();
    for (const roleName of PROVIDER_LANE_ROLE_KEYS) {
        const role         = roles[roleName] || {};
        const lane         = lanes[role.lane];
        const expectedRole = PROVIDER_LANE_ROLE_CONTRACT[roleName];
        fail(sameSet(Object.keys(role), [
            'baseUrl', 'configPath', 'consumers', 'lane', 'modelId', 'provider', 'roleKey', 'serviceKey'
        ]), 'role-field-set', `roles.${roleName}`,
        ['baseUrl', 'configPath', 'consumers', 'lane', 'modelId', 'provider', 'roleKey', 'serviceKey'], Object.keys(role));
        fail(role.roleKey === roleName, 'role-key', `roles.${roleName}.roleKey`, roleName, role.roleKey);
        fail(role.configPath === expectedRole.configPath, 'role-config-path', `roles.${roleName}.configPath`, expectedRole.configPath, role.configPath);
        fail(role.lane === expectedRole.lane, 'role-lane-assignment', `roles.${roleName}.lane`, expectedRole.lane, role.lane);
        fail(Boolean(lane), 'role-lane', `roles.${roleName}.lane`, PROVIDER_LANE_KEYS, role.lane);
        fail(role.serviceKey === lane?.serviceKey, 'role-service', `roles.${roleName}.serviceKey`, lane?.serviceKey, role.serviceKey);
        fail(role.provider === lane?.provider, 'role-provider', `roles.${roleName}.provider`, lane?.provider, role.provider);
        fail(role.modelId === lane?.model?.id, 'role-model', `roles.${roleName}.modelId`, lane?.model?.id, role.modelId);
        fail(role.baseUrl === lane?.baseUrl, 'role-base-url', `roles.${roleName}.baseUrl`, lane?.baseUrl, role.baseUrl);
        const expectedConsumers = PROVIDER_LANE_CONSUMER_CENSUS.filter(row => row.role === roleName).map(row => row.id);
        fail(sameSet(role.consumers, expectedConsumers), 'consumer-set', `roles.${roleName}.consumers`, expectedConsumers, role.consumers);
        for (const consumer of role.consumers || []) {
            fail(!seenConsumers.has(consumer), 'consumer-multiple-roles', `roles.${roleName}.consumers`, 'one role', consumer);
            seenConsumers.set(consumer, roleName);
        }
    }

    return {valid: errors.length === 0, errors}
}

/**
 * @summary Analyzes rendered Compose, cross-checking the descriptive extension against effective
 * service images, limits, env, dependencies, and source consumers before emitting the receipt.
 * @param {Object} composition Output from `docker compose config --format json`.
 * @param {Object} [options]
 * @param {String} [options.projectRoot=PROJECT_ROOT] Checkout root for consumer anchors.
 * @param {Boolean} [options.verifySources=true] Verify current source anchors.
 * @returns {Object} Stable provider-lane receipt.
 */
export function analyzeProviderLaneComposition(composition, {
    projectRoot   = PROJECT_ROOT,
    verifySources = true
} = {}) {
    const errors      = [];
    const declaration = composition?.['x-provider-lane-contract'];
    const services    = composition?.services || {};
    const fail        = (condition, code, pathName, expected, actual) =>
        assertValue(errors, condition, code, pathName, expected, actual);

    fail(Boolean(declaration), 'contract-missing', 'x-provider-lane-contract', 'object', declaration);
    fail(declaration?.schemaVersion === PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION,
        'declared-schema-version', 'x-provider-lane-contract.schemaVersion', PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION, declaration?.schemaVersion);

    const lanes = Object.fromEntries(PROVIDER_LANE_KEYS.map(name => [name, laneReceipt(name, declaration?.lanes?.[name])]));
    const roles = Object.fromEntries(PROVIDER_LANE_ROLE_KEYS.map(name => [name, roleReceipt(name, declaration?.roles?.[name], lanes)]));
    const total = {
        cpuCores   : numberAboveZero(declaration?.envelope?.cpus),
        memoryBytes: bytes(declaration?.envelope?.memoryBytes)
    };

    const input            = (key, value) => ({env: PROVIDER_LANE_DEPLOYMENT_INPUT_ENVS[key], value});
    const deploymentInputs = {
        totalCpuCores                        : input('totalCpuCores', total.cpuCores),
        totalMemoryBytes                     : input('totalMemoryBytes', total.memoryBytes),
        chatCpuCores                         : input('chatCpuCores', lanes.chat.cpuCores),
        chatMemoryBytes                      : input('chatMemoryBytes', lanes.chat.memoryBytes),
        chatContextTokens                    : input('chatContextTokens', lanes.chat.totalContextTokens),
        embeddingCpuCores                    : input('embeddingCpuCores', lanes.embedding.cpuCores),
        embeddingMemoryBytes                 : input('embeddingMemoryBytes', lanes.embedding.memoryBytes),
        embeddingParallelSlots               : input('embeddingParallelSlots', lanes.embedding.parallelSlots),
        embeddingTotalContextTokens          : input('embeddingTotalContextTokens', lanes.embedding.totalContextTokens),
        embeddingContextTokensPerSlotRequired: input('embeddingContextTokensPerSlotRequired', lanes.embedding.contextTokensPerSlotRequired),
        embeddingBatchTokens                 : input('embeddingBatchTokens', lanes.embedding.batchTokens),
        embeddingUbatchTokens                : input('embeddingUbatchTokens', lanes.embedding.ubatchTokens)
    };

    const receipt = {
        schemaVersion : PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION,
        ready         : false,
        errors,
        composeProject: composition?.name || null,
        envelope      : {
            scope      : 'provider-runtimes',
            total,
            allocations: Object.fromEntries(PROVIDER_LANE_KEYS.map(name => [name, {
                cpuCores   : lanes[name].cpuCores,
                memoryBytes: lanes[name].memoryBytes
            }]))
        },
        deploymentInputs,
        lanes,
        roles,
        consumerCensus: PROVIDER_LANE_CONSUMER_CENSUS.map(row => ({...row}))
    };

    for (const laneName of PROVIDER_LANE_KEYS) {
        const lane            = lanes[laneName];
        const declarationLane = declaration?.lanes?.[laneName] || {};
        const service         = services[lane.serviceKey];
        const env             = normalizeEnvironment(service);
        const limits          = service?.deploy?.resources?.limits || {};
        const controls        = declarationLane.controls || {};

        fail(Boolean(service), 'service-missing', `services.${lane.serviceKey}`, 'rendered service', service);
        fail(service?.image === declarationLane.image, 'service-image-drift', `services.${lane.serviceKey}.image`, declarationLane.image, service?.image);
        fail(numberAboveZero(limits.cpus) === lane.cpuCores, 'service-cpu-drift', `services.${lane.serviceKey}.deploy.resources.limits.cpus`, lane.cpuCores, limits.cpus);
        fail(bytes(limits.memory) === lane.memoryBytes, 'service-memory-drift', `services.${lane.serviceKey}.deploy.resources.limits.memory`, lane.memoryBytes, limits.memory);
        fail(integerAboveZero(env[controls.contextEnv]) === lane.totalContextTokens, 'service-context-drift', `services.${lane.serviceKey}.environment.${controls.contextEnv}`, lane.totalContextTokens, env[controls.contextEnv]);
        fail(integerAboveZero(env[controls.slotsEnv]) === lane.parallelSlots, 'service-slots-drift', `services.${lane.serviceKey}.environment.${controls.slotsEnv}`, lane.parallelSlots, env[controls.slotsEnv]);
        if (laneName === 'embedding') {
            fail(integerAboveZero(env[controls.batchEnv]) === lane.batchTokens,
                'service-batch-drift', `services.${lane.serviceKey}.environment.${controls.batchEnv}`, lane.batchTokens, env[controls.batchEnv]);
            fail(integerAboveZero(env[controls.ubatchEnv]) === lane.ubatchTokens,
                'service-ubatch-drift', `services.${lane.serviceKey}.environment.${controls.ubatchEnv}`, lane.ubatchTokens, env[controls.ubatchEnv]);
        }
        fail(lane.dnsName === lane.serviceKey, 'service-dns-drift', `x-provider-lane-contract.lanes.${laneName}.endpoints`, lane.serviceKey, lane.dnsName);
    }

    const chatService      = services[lanes.chat.serviceKey];
    const chatEnv          = normalizeEnvironment(chatService);
    const embeddingService = services[lanes.embedding.serviceKey];
    const embeddingEnv     = normalizeEnvironment(embeddingService);
    const chatBootCommand  = commandText(chatService);
    fail(chatEnv.OLLAMA_NUM_PARALLEL === '1', 'chat-parallelism', 'services.chat-model.environment.OLLAMA_NUM_PARALLEL', '1', chatEnv.OLLAMA_NUM_PARALLEL);
    fail(/\/bin\/ollama show "\${1,2}NEO_PROVIDER_LANE_MODEL" >\/dev\/null 2>&1 \|\| \/bin\/ollama pull "\${1,2}NEO_PROVIDER_LANE_MODEL"/.test(chatBootCommand),
        'chat-model-warm-cache-boot', 'services.chat-model.command', 'local show before pull', chatBootCommand);
    fail(chatBootCommand.includes('sha256sum -c'), 'chat-model-verification', 'services.chat-model.command', 'sha256sum -c', chatBootCommand);
    fail(chatEnv.NEO_PROVIDER_LANE_WEIGHTS_BLOB === lanes.chat.model.digest.replace(':', '-'), 'chat-model-digest-drift', 'services.chat-model.environment.NEO_PROVIDER_LANE_WEIGHTS_BLOB', lanes.chat.model.digest.replace(':', '-'), chatEnv.NEO_PROVIDER_LANE_WEIGHTS_BLOB);
    fail(embeddingEnv.LLAMA_ARG_ENDPOINT_SLOTS === 'true', 'slots-endpoint-disabled', 'services.embedding-model.environment.LLAMA_ARG_ENDPOINT_SLOTS', 'true', embeddingEnv.LLAMA_ARG_ENDPOINT_SLOTS);
    fail(commandText(embeddingService).includes('sha256sum -c'), 'embedding-model-verification', 'services.embedding-model.command', 'sha256sum -c', commandText(embeddingService));
    fail(embeddingEnv.NEO_PROVIDER_LANE_MODEL_SHA256 === lanes.embedding.model.digest.replace(/^sha256:/, ''), 'embedding-model-digest-drift', 'services.embedding-model.environment.NEO_PROVIDER_LANE_MODEL_SHA256', lanes.embedding.model.digest.replace(/^sha256:/, ''), embeddingEnv.NEO_PROVIDER_LANE_MODEL_SHA256);
    fail(typeof embeddingEnv.NEO_PROVIDER_LANE_MODEL_URL === 'string' && lanes.embedding.model.coordinate.includes('@69d0e58a13e463cd99a9b83e3f5fee7c10265fab/') && embeddingEnv.NEO_PROVIDER_LANE_MODEL_URL.includes('/69d0e58a13e463cd99a9b83e3f5fee7c10265fab/'),
        'embedding-model-coordinate-drift', 'services.embedding-model.environment.NEO_PROVIDER_LANE_MODEL_URL', lanes.embedding.model.coordinate, embeddingEnv.NEO_PROVIDER_LANE_MODEL_URL);

    // Steady-state probes must be liveness-only. Hashing multi-GB weights inside the
    // lane's own CPU quota starves the probe under exactly the load it must tolerate, and the
    // false unhealthy feeds the recovery actuator a restart that destroys in-flight work. The
    // boot-time integrity checks stay asserted above via the entrypoint command assertions.
    const chatProbe      = healthcheckText(chatService);
    const embeddingProbe = healthcheckText(embeddingService);
    fail(!chatProbe.includes('sha256sum'), 'chat-probe-heavy-integrity',
        'services.chat-model.healthcheck.test', 'liveness probe free of weight/manifest hashing', chatProbe);
    fail(!embeddingProbe.includes('sha256sum'), 'embedding-probe-heavy-integrity',
        'services.embedding-model.healthcheck.test', 'liveness probe free of weight hashing', embeddingProbe);
    fail(embeddingProbe.includes('/health'), 'embedding-probe-liveness-missing',
        'services.embedding-model.healthcheck.test', 'curl /health liveness probe', embeddingProbe);

    // Compute threads must be pinned to the elected CPU allocation. llama.cpp's -1 default
    // resolves compute workers to the host's PHYSICAL cores and its HTTP pool to
    // max(n_parallel + 4, hardware_concurrency - 1) — a CPU quota changes neither answer — so
    // an unpinned lane runs host-sized pools inside its quota (observed: 98 threads in a 6-cpu
    // cgroup on a 32c/64t host, ~5.3x compute oversubscription presenting as saturation).
    const embeddingThreads = integerAboveZero(embeddingEnv.LLAMA_ARG_THREADS);
    fail(embeddingThreads !== null, 'embedding-threads-unpinned',
        'services.embedding-model.environment.LLAMA_ARG_THREADS',
        'positive integer pinned to the lane CPU allocation', embeddingEnv.LLAMA_ARG_THREADS ?? null);
    if (embeddingThreads !== null) {
        fail(embeddingThreads <= Math.ceil(lanes.embedding.cpuCores), 'embedding-threads-oversubscribed',
            'services.embedding-model.environment.LLAMA_ARG_THREADS',
            `<= ceil(lane cpuCores ${lanes.embedding.cpuCores})`, embeddingThreads);
    }
    fail(integerAboveZero(embeddingEnv.LLAMA_ARG_THREADS_HTTP) !== null, 'embedding-http-threads-unpinned',
        'services.embedding-model.environment.LLAMA_ARG_THREADS_HTTP', 'positive integer', embeddingEnv.LLAMA_ARG_THREADS_HTTP ?? null);

    const applicationServices = ['kb-server', 'mc-server', 'orchestrator'];
    for (const serviceKey of applicationServices) {
        const service  = services[serviceKey];
        const env      = normalizeEnvironment(service);
        const expected = {
            NEO_MODEL_PROVIDER                   : roles.model.provider,
            NEO_GRAPH_PROVIDER                   : roles.graph.provider,
            NEO_EMBEDDING_PROVIDER               : roles.embedding.provider,
            NEO_OLLAMA_HOST                      : lanes.chat.baseUrl,
            NEO_OLLAMA_MODEL                     : lanes.chat.model.id,
            NEO_OPENAI_COMPATIBLE_HOST           : lanes.embedding.baseUrl,
            NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL: lanes.embedding.model.id
        };

        for (const [envName, expectedValue] of Object.entries(expected)) {
            fail(env[envName] === expectedValue, 'application-route-drift', `services.${serviceKey}.environment.${envName}`, expectedValue, env[envName]);
        }
        for (const [envName, expectedValue] of Object.entries({
            NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS     : lanes.chat.contextTokensPerSlotRequired,
            NEO_LOCAL_MODELS_CHAT_PARALLEL                 : lanes.chat.parallelSlots,
            NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS: lanes.embedding.contextTokensPerSlotRequired,
            NEO_LOCAL_MODELS_EMBEDDING_PARALLEL            : lanes.embedding.parallelSlots
        })) {
            fail(integerAboveZero(env[envName]) === expectedValue, 'application-runtime-contract-drift',
                `services.${serviceKey}.environment.${envName}`, expectedValue, env[envName]);
        }
        for (const lane of Object.values(lanes)) {
            fail(service?.depends_on?.[lane.serviceKey]?.condition === 'service_healthy', 'readiness-dependency', `services.${serviceKey}.depends_on.${lane.serviceKey}`, 'service_healthy', service?.depends_on?.[lane.serviceKey]?.condition);
        }
    }

    const kbEnv = normalizeEnvironment(services['kb-server']);
    for (const [envName, expectedValue] of Object.entries({
        NEO_KB_ASK_PROVIDER: roles.kbAskSynthesis.provider,
        NEO_KB_ASK_MODEL   : roles.kbAskSynthesis.modelId,
        NEO_KB_ASK_BASE_URL: roles.kbAskSynthesis.baseUrl,
        NEO_KB_ASK_API_KEY : ''
    })) {
        fail(kbEnv[envName] === expectedValue, 'ask-route-drift', `services.kb-server.environment.${envName}`, expectedValue, kbEnv[envName]);
    }

    const orchestratorEnv = normalizeEnvironment(services.orchestrator);
    const runtimeRoster   = String(orchestratorEnv.NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES || '').split(',').filter(Boolean);
    for (const lane of Object.values(lanes)) {
        fail(runtimeRoster.includes(lane.serviceKey), 'runtime-roster', 'services.orchestrator.environment.NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES', lane.serviceKey, runtimeRoster);
    }
    const residencyRoster = String(orchestratorEnv.NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS || '').split(',').filter(Boolean);
    fail(sameSet(residencyRoster, [lanes.chat.serviceKey]), 'residency-roster', 'services.orchestrator.environment.NEO_DEPLOYMENT_STATE_BRIDGE_PROVIDER_RESIDENCY_SERVICE_KEYS', [lanes.chat.serviceKey], residencyRoster);

    if (verifySources) {
        for (const row of PROVIDER_LANE_CONSUMER_CENSUS) {
            const absolute = path.join(projectRoot, row.source);
            fail(fs.existsSync(absolute), 'consumer-source-missing', `consumerCensus.${row.id}.source`, row.source, null);
            if (fs.existsSync(absolute)) {
                const source = fs.readFileSync(absolute, 'utf8');
                fail(source.includes(row.anchor), 'consumer-anchor-missing', `consumerCensus.${row.id}.anchor`, row.anchor, row.source);
            }
        }
    }

    const structural = validateProviderLaneCompositionReceipt(receipt, {requireReady: false});
    errors.push(...structural.errors);
    receipt.ready = errors.length === 0;
    return receipt
}

/**
 * @summary Parses the deliberately small CLI surface.
 * @param {String[]} argv Arguments without node/script.
 * @returns {{input: String|null, verifySources: Boolean}}
 */
export function parseArgs(argv = []) {
    let input = null, verifySources = true;

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--input') {
            input = argv[++index];
            if (!input) throw new Error('--input requires a file path');
        } else if (argument === '--skip-source-census') {
            verifySources = false;
        } else {
            throw new Error(`Unknown argument '${argument}'`)
        }
    }

    return {input, verifySources}
}

/**
 * @summary Reads rendered Compose JSON and emits exactly one JSON receipt.
 * @param {String[]} [argv] Arguments without node/script.
 * @returns {Object} Emitted receipt.
 */
export function main(argv = process.argv.slice(2)) {
    const options     = parseArgs(argv);
    const source      = options.input ? fs.readFileSync(options.input, 'utf8') : fs.readFileSync(0, 'utf8');
    const composition = JSON.parse(source);
    const receipt     = analyzeProviderLaneComposition(composition, {verifySources: options.verifySources});

    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (!receipt.ready) process.exitCode = 1;
    return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main()
    } catch (error) {
        process.stderr.write(`providerLaneComposition: ${error.message}\n`);
        process.exitCode = 2;
    }
}
