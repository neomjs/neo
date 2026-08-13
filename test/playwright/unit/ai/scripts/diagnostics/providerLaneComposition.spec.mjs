import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {load as loadYaml} from 'js-yaml';
import {
    PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION,
    analyzeProviderLaneComposition,
    parseArgs,
    validateProviderLaneCompositionReceipt
} from '../../../../../../ai/scripts/diagnostics/providerLaneComposition.mjs';

const repoRoot    = path.resolve(process.cwd());
const profilePath = path.join(repoRoot, 'ai/deploy/docker-compose.provider-lanes.yml');

const FIXTURE_ENV = Object.freeze({
    NEO_PROVIDER_LANES_CPU_TOTAL                                : '4',
    NEO_PROVIDER_LANES_MEMORY_BYTES_TOTAL                       : '51539607552',
    NEO_PROVIDER_LANE_CHAT_CPUS                                 : '2',
    NEO_PROVIDER_LANE_CHAT_MEMORY_BYTES                         : '34359738368',
    NEO_PROVIDER_LANE_CHAT_CONTEXT_TOKENS                       : '32768',
    NEO_PROVIDER_LANE_EMBEDDING_CPUS                            : '2',
    NEO_PROVIDER_LANE_EMBEDDING_MEMORY_BYTES                    : '17179869184',
    NEO_PROVIDER_LANE_EMBEDDING_SLOTS                           : '1',
    NEO_PROVIDER_LANE_EMBEDDING_TOTAL_CONTEXT_TOKENS            : '32768',
    NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED: '8192',
    NEO_PROVIDER_LANE_EMBEDDING_BATCH_TOKENS                    : '32768',
    NEO_PROVIDER_LANE_EMBEDDING_UBATCH_TOKENS                   : '32768',
    NEO_PROVIDER_LANE_EMBEDDING_THREADS                         : '2'
});

function renderRequiredInputs(source) {
    return source.replace(/\$\{([A-Z0-9_]+):\?[^}]+}/g, (match, name) => {
        if (!Object.hasOwn(FIXTURE_ENV, name)) {
            throw new Error(`provider-lane fixture has no value for ${name}`)
        }
        return FIXTURE_ENV[name]
    })
}

function loadComposition() {
    const source      = renderRequiredInputs(fs.readFileSync(profilePath, 'utf8'));
    const composition = {name: 'neo-agent-os-test', ...loadYaml(source)};
    const shared      = composition['x-provider-lane-env'];

    // Compose materializes the YAML merge before emitting `config --format json`. js-yaml keeps
    // the extension independently, so the unit fixture performs that one documented render step;
    // the analyzer still receives exactly the effective environment shape its CLI receives.
    for (const serviceKey of ['kb-server', 'mc-server', 'orchestrator']) {
        composition.services[serviceKey].environment = {
            ...shared,
            ...composition.services[serviceKey].environment
        }
    }

    return composition
}

function clone(value) {
    return structuredClone(value)
}

function errorCodes(receipt) {
    return receipt.errors.map(error => error.code)
}

function environmentNames(service) {
    const environment = service?.environment || {};
    if (Array.isArray(environment)) {
        return environment.map(value => String(value).split('=', 1)[0])
    }
    return Object.keys(environment)
}

function walkMjsFiles(directory) {
    const files = [];

    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkMjsFiles(absolute))
        } else if (entry.name.endsWith('.mjs')) {
            files.push(absolute)
        }
    }

    return files
}

test.describe('provider-lane composition receipt (#17021)', () => {
    test('the tracked profile emits one valid receipt for the exact two-lane contract', () => {
        const receipt = analyzeProviderLaneComposition(loadComposition());

        expect(receipt.ready, JSON.stringify(receipt.errors, null, 2)).toBe(true);
        expect(receipt.errors).toEqual([]);
        expect(receipt.schemaVersion).toBe(PROVIDER_LANE_COMPOSITION_SCHEMA_VERSION);
        expect(receipt.envelope).toMatchObject({
            scope      : 'provider-runtimes',
            total      : {cpuCores: 4, memoryBytes: 51539607552},
            allocations: {
                chat     : {cpuCores: 2, memoryBytes: 34359738368},
                embedding: {cpuCores: 2, memoryBytes: 17179869184}
            }
        });
        expect(receipt.lanes.chat).toMatchObject({
            serviceKey   : 'chat-model',
            dnsName      : 'chat-model',
            provider     : 'ollama',
            parallelSlots: 1,
            model        : {contextTokensMax: 262144},
            endpoints    : {workload: {kind: 'ollamaChat', url: 'http://chat-model:11434/api/chat'}}
        });
        expect(receipt.lanes.embedding).toMatchObject({
            serviceKey: 'embedding-model',
            dnsName   : 'embedding-model',
            provider  : 'openAiCompatible',
            model     : {contextTokensMax: 32768},
            endpoints : {slotContext: {
                kind              : 'llamaCppSlots',
                url               : 'http://embedding-model:8080/slots',
                slotIdField       : 'id',
                contextTokensField: 'n_ctx',
                processingField   : 'is_processing'
            }}
        });
        expect(validateProviderLaneCompositionReceipt(receipt)).toEqual({valid: true, errors: []})
    });

    test('a graph role moved onto the embedding lane is refused even when internally self-consistent', () => {
        const composition = loadComposition();
        Object.assign(composition['x-provider-lane-contract'].roles.graph, {
            lane    : 'embedding',
            provider: 'openAiCompatible',
            model   : 'qwen3-embedding-8b'
        });

        const receipt = analyzeProviderLaneComposition(composition);

        expect(receipt.ready).toBe(false);
        expect(errorCodes(receipt)).toContain('role-lane-assignment')
    });

    test('a selector or DNS mutation cannot hide behind a valid descriptive extension', () => {
        const selectorMutation = loadComposition();
        selectorMutation.services['kb-server'].environment.NEO_GRAPH_PROVIDER = 'openAiCompatible';

        const selectorReceipt = analyzeProviderLaneComposition(selectorMutation);
        expect(errorCodes(selectorReceipt)).toContain('application-route-drift');

        const dnsMutation = loadComposition();
        dnsMutation['x-provider-lane-contract'].lanes.embedding.endpoints.workload.baseUrl = 'http://chat-model:8080';
        dnsMutation['x-provider-lane-contract'].lanes.embedding.endpoints.readiness.baseUrl = 'http://chat-model:8080';
        dnsMutation['x-provider-lane-contract'].lanes.embedding.endpoints.models.baseUrl = 'http://chat-model:8080';
        dnsMutation['x-provider-lane-contract'].lanes.embedding.endpoints.slotContext.baseUrl = 'http://chat-model:8080';

        const dnsReceipt = analyzeProviderLaneComposition(dnsMutation);
        expect(errorCodes(dnsReceipt)).toContain('service-dns-drift')
    });

    test('runtime image/model drift and a collapsed service fail independently', () => {
        const imageMutation = loadComposition();
        imageMutation.services['embedding-model'].image = 'ghcr.io/ggml-org/llama.cpp:server-b10380';
        const imageReceipt = analyzeProviderLaneComposition(imageMutation);
        expect(errorCodes(imageReceipt)).toContain('service-image-drift');

        const modelMutation = loadComposition();
        modelMutation.services['embedding-model'].environment.NEO_PROVIDER_LANE_MODEL_SHA256 = '0'.repeat(64);
        const modelReceipt = analyzeProviderLaneComposition(modelMutation);
        expect(errorCodes(modelReceipt)).toContain('embedding-model-digest-drift');

        const collapseMutation = loadComposition();
        collapseMutation['x-provider-lane-contract'].lanes.embedding.service = 'chat-model';
        const collapseReceipt = analyzeProviderLaneComposition(collapseMutation);
        expect(errorCodes(collapseReceipt)).toContain('lane-collapse')
    });

    test('chat-model warm-cache boot checks local presence before any registry pull', () => {
        const composition = loadComposition();
        const guardedPull = '/bin/ollama show "$$NEO_PROVIDER_LANE_MODEL" >/dev/null 2>&1 || ' +
            '/bin/ollama pull "$$NEO_PROVIDER_LANE_MODEL"';
        const command = composition.services['chat-model'].command.join('\n');

        expect(command).toContain(guardedPull);

        composition.services['chat-model'].command = composition.services['chat-model'].command.map(value =>
            value.replace(guardedPull, '/bin/ollama pull "$$NEO_PROVIDER_LANE_MODEL"'));

        expect(errorCodes(analyzeProviderLaneComposition(composition))).toContain('chat-model-warm-cache-boot')
    });

    test('the fixed envelope and service limits must agree exactly', () => {
        const envelopeMutation = loadComposition();
        envelopeMutation['x-provider-lane-contract'].envelope.cpus = 5;
        const envelopeReceipt = analyzeProviderLaneComposition(envelopeMutation);
        expect(errorCodes(envelopeReceipt)).toContain('cpu-envelope-sum');

        const serviceMutation = loadComposition();
        serviceMutation.services['chat-model'].deploy.resources.limits.cpus = 3;
        const serviceReceipt = analyzeProviderLaneComposition(serviceMutation);
        expect(errorCodes(serviceReceipt)).toContain('service-cpu-drift')
    });

    test('application runtime context and slot contracts cannot drift from the elected lane', () => {
        const contextMutation = loadComposition();
        contextMutation.services['kb-server'].environment.NEO_LOCAL_MODELS_EMBEDDING_CONTEXT_LIMIT_TOKENS = '1';
        expect(errorCodes(analyzeProviderLaneComposition(contextMutation))).toContain('application-runtime-contract-drift');

        const parallelMutation = loadComposition();
        parallelMutation.services['orchestrator'].environment.NEO_LOCAL_MODELS_CHAT_PARALLEL = '2';
        expect(errorCodes(analyzeProviderLaneComposition(parallelMutation))).toContain('application-runtime-contract-drift')
    });

    test('chat parallelism stays one and embedding total context cannot masquerade as per-slot context', () => {
        const chatMutation = loadComposition();
        chatMutation['x-provider-lane-contract'].lanes.chat.slots = 2;
        chatMutation.services['chat-model'].environment.OLLAMA_NUM_PARALLEL = '2';
        const chatReceipt = analyzeProviderLaneComposition(chatMutation);
        expect(errorCodes(chatReceipt)).toContain('chat-parallelism');

        const contextMutation = loadComposition();
        contextMutation['x-provider-lane-contract'].lanes.embedding.slots = 2;
        contextMutation['x-provider-lane-contract'].lanes.embedding.contextTokensPerSlotRequired = 32768;
        contextMutation.services['embedding-model'].environment.LLAMA_ARG_N_PARALLEL = '2';
        const contextReceipt = analyzeProviderLaneComposition(contextMutation);
        expect(errorCodes(contextReceipt)).toContain('context-allocation')
    });

    test('the pinned embedding runtime declares logical and physical batch authority', () => {
        const good = analyzeProviderLaneComposition(loadComposition());

        expect(good.lanes.embedding).toMatchObject({batchTokens: 32768, ubatchTokens: 32768});
        expect(good.deploymentInputs).toMatchObject({
            embeddingBatchTokens : {env: 'NEO_PROVIDER_LANE_EMBEDDING_BATCH_TOKENS', value: 32768},
            embeddingUbatchTokens: {env: 'NEO_PROVIDER_LANE_EMBEDDING_UBATCH_TOKENS', value: 32768}
        });

        const missingBatch = loadComposition();
        delete missingBatch.services['embedding-model'].environment.LLAMA_ARG_BATCH;
        expect(errorCodes(analyzeProviderLaneComposition(missingBatch))).toContain('service-batch-drift');

        const driftedUbatch = loadComposition();
        driftedUbatch.services['embedding-model'].environment.LLAMA_ARG_UBATCH = '512';
        expect(errorCodes(analyzeProviderLaneComposition(driftedUbatch))).toContain('service-ubatch-drift');

        const decoupled = clone(good);
        decoupled.lanes.embedding.batchTokens = 65536;
        decoupled.deploymentInputs.embeddingBatchTokens.value = 65536;
        expect(validateProviderLaneCompositionReceipt(decoupled).errors.map(error => error.code))
            .toContain('embedding-batch-ubatch-coupling');

        const insufficient = clone(good);
        insufficient.lanes.embedding.batchTokens = 8192;
        insufficient.lanes.embedding.ubatchTokens = 8192;
        insufficient.deploymentInputs.embeddingBatchTokens.value = 8192;
        insufficient.deploymentInputs.embeddingUbatchTokens.value = 8192;
        expect(validateProviderLaneCompositionReceipt(insufficient).errors.map(error => error.code))
            .toContain('embedding-batch-context-coupling')
    });

    test('the pure receipt cannot exceed or forge either pinned model context ceiling', () => {
        const good = analyzeProviderLaneComposition(loadComposition());

        const perSlotMutation = clone(good);
        perSlotMutation.lanes.embedding.contextTokensPerSlotRequired = 32769;
        perSlotMutation.lanes.embedding.totalContextTokens = 32769;
        perSlotMutation.deploymentInputs.embeddingContextTokensPerSlotRequired.value = 32769;
        perSlotMutation.deploymentInputs.embeddingTotalContextTokens.value = 32769;
        expect(validateProviderLaneCompositionReceipt(perSlotMutation).errors.map(error => error.code)).toContain('model-context-ceiling');

        const totalMutation = clone(good);
        totalMutation.lanes.embedding.totalContextTokens = 32769;
        totalMutation.deploymentInputs.embeddingTotalContextTokens.value = 32769;
        expect(validateProviderLaneCompositionReceipt(totalMutation).errors.map(error => error.code)).toContain('model-total-context-ceiling');

        const forgedCeiling = clone(good);
        forgedCeiling.lanes.embedding.model.contextTokensMax = 40960;
        forgedCeiling.lanes.embedding.contextTokensPerSlotRequired = 40960;
        forgedCeiling.lanes.embedding.totalContextTokens = 40960;
        forgedCeiling.deploymentInputs.embeddingContextTokensPerSlotRequired.value = 40960;
        forgedCeiling.deploymentInputs.embeddingTotalContextTokens.value = 40960;
        expect(validateProviderLaneCompositionReceipt(forgedCeiling).errors.map(error => error.code)).toContain('model-contract');

        const chatMutation = clone(good);
        chatMutation.lanes.chat.contextTokensPerSlotRequired = 262145;
        chatMutation.lanes.chat.totalContextTokens = 262145;
        chatMutation.deploymentInputs.chatContextTokens.value = 262145;
        expect(validateProviderLaneCompositionReceipt(chatMutation).errors.map(error => error.code)).toContain('model-context-ceiling')
    });

    test('the pure validator binds every deployment input name and value to receipt authority', () => {
        const good = analyzeProviderLaneComposition(loadComposition());

        const wrongEnv = clone(good);
        wrongEnv.deploymentInputs.embeddingParallelSlots.env = 'NEO_FOREIGN_SLOTS';
        expect(validateProviderLaneCompositionReceipt(wrongEnv).errors.map(error => error.code)).toContain('deployment-input-env');

        const wrongValue = clone(good);
        wrongValue.deploymentInputs.chatCpuCores.value += 1;
        expect(validateProviderLaneCompositionReceipt(wrongValue).errors.map(error => error.code)).toContain('deployment-input-value');

        const missingInput = clone(good);
        delete missingInput.deploymentInputs.totalMemoryBytes;
        expect(validateProviderLaneCompositionReceipt(missingInput).errors.map(error => error.code)).toContain('deployment-input-set');

        const extraInput = clone(good);
        extraInput.deploymentInputs.foreign = {env: 'NEO_FOREIGN', value: 1};
        expect(validateProviderLaneCompositionReceipt(extraInput).errors.map(error => error.code)).toContain('deployment-input-set');

        const extraField = clone(good);
        extraField.deploymentInputs.totalCpuCores.source = 'untrusted';
        expect(validateProviderLaneCompositionReceipt(extraField).errors.map(error => error.code)).toContain('deployment-input-field-set');

        const extraReceiptField = clone(good);
        extraReceiptField.selfAttested = true;
        expect(validateProviderLaneCompositionReceipt(extraReceiptField).errors.map(error => error.code))
            .toContain('receipt-field-set');

        const extraLaneField = clone(good);
        extraLaneField.lanes.embedding.token = 'SECRET';
        expect(validateProviderLaneCompositionReceipt(extraLaneField).errors.map(error => error.code))
            .toContain('lane-field-set')
    });

    test('the llama.cpp slot oracle is required and cannot be description-only', () => {
        const composition = loadComposition();
        delete composition.services['embedding-model'].environment.LLAMA_ARG_ENDPOINT_SLOTS;

        const receipt = analyzeProviderLaneComposition(composition);
        expect(receipt.ready).toBe(false);
        expect(errorCodes(receipt)).toContain('slots-endpoint-disabled')
    });

    test('a steady-state probe that hashes model weights is refused on either lane (#17063)', () => {
        const hashedEmbedding = loadComposition();
        hashedEmbedding.services['embedding-model'].healthcheck.test = [
            'CMD-SHELL',
            'curl --fail --silent http://127.0.0.1:8080/health >/dev/null && echo "x  /models/model.gguf" | sha256sum -c - >/dev/null'
        ];
        expect(errorCodes(analyzeProviderLaneComposition(hashedEmbedding))).toContain('embedding-probe-heavy-integrity');

        const hashedChat = loadComposition();
        hashedChat.services['chat-model'].healthcheck.test = [
            'CMD-SHELL',
            'ollama show "$NEO_PROVIDER_LANE_MODEL" >/dev/null && echo "x  manifest" | sha256sum -c - >/dev/null'
        ];
        expect(errorCodes(analyzeProviderLaneComposition(hashedChat))).toContain('chat-probe-heavy-integrity');

        const nonLiveness = loadComposition();
        nonLiveness.services['embedding-model'].healthcheck.test = ['CMD-SHELL', 'true'];
        expect(errorCodes(analyzeProviderLaneComposition(nonLiveness))).toContain('embedding-probe-liveness-missing')
    });

    test('an embedding lane with unpinned or oversubscribed compute threads is refused (#17073)', () => {
        const unpinned = loadComposition();
        delete unpinned.services['embedding-model'].environment.LLAMA_ARG_THREADS;
        const unpinnedReceipt = analyzeProviderLaneComposition(unpinned);
        expect(unpinnedReceipt.ready).toBe(false);
        expect(errorCodes(unpinnedReceipt)).toContain('embedding-threads-unpinned');

        const oversubscribed = loadComposition();
        oversubscribed.services['embedding-model'].environment.LLAMA_ARG_THREADS = '64';
        expect(errorCodes(analyzeProviderLaneComposition(oversubscribed))).toContain('embedding-threads-oversubscribed');

        const httpUnpinned = loadComposition();
        delete httpUnpinned.services['embedding-model'].environment.LLAMA_ARG_THREADS_HTTP;
        expect(errorCodes(analyzeProviderLaneComposition(httpUnpinned))).toContain('embedding-http-threads-unpinned')
    });

    test('the pure downstream validator rejects unknown and unready receipts without Compose', () => {
        const good    = analyzeProviderLaneComposition(loadComposition());
        const unknown = clone(good);
        unknown.schemaVersion = 'provider-lane-composition.v2';
        expect(validateProviderLaneCompositionReceipt(unknown).errors.map(error => error.code)).toContain('schema-version');

        const unready = clone(good);
        unready.ready = false;
        expect(validateProviderLaneCompositionReceipt(unready).errors.map(error => error.code)).toContain('receipt-not-ready')
    });

    test('the pure validator binds every endpoint to its lane identity and exact protocol contract', () => {
        const good      = analyzeProviderLaneComposition(loadComposition());
        const endpoints = [
            {lane: 'chat', endpoint: 'workload', path: '/api/chat', kind: 'ollamaChat', metadata: {inputField: 'messages', modelField: 'model'}},
            {lane: 'chat', endpoint: 'modelContext', path: '/api/ps', kind: 'ollamaRunningModels', metadata: {modelIdField: 'name', contextTokensField: 'context_length'}},
            {lane: 'embedding', endpoint: 'workload', path: '/v1/embeddings', kind: 'openAiEmbeddings', metadata: {inputField: 'input', modelField: 'model'}},
            {lane: 'embedding', endpoint: 'readiness', path: '/health'},
            {lane: 'embedding', endpoint: 'models', path: '/v1/models'},
            {lane: 'embedding', endpoint: 'slotContext', path: '/slots', kind: 'llamaCppSlots', metadata: {slotIdField: 'id', contextTokensField: 'n_ctx', processingField: 'is_processing'}}
        ];

        for (const {lane, endpoint, path: pathName, kind, metadata = {}} of endpoints) {
            const foreignHost = clone(good);
            foreignHost.lanes[lane].endpoints[endpoint].url = `https://external.example${pathName}`;
            expect(validateProviderLaneCompositionReceipt(foreignHost).errors.map(error => error.code), `${lane}.${endpoint} host`).toContain('endpoint-host');

            const wrongPath = clone(good);
            wrongPath.lanes[lane].endpoints[endpoint].url = `${good.lanes[lane].baseUrl}/wrong-path`;
            expect(validateProviderLaneCompositionReceipt(wrongPath).errors.map(error => error.code), `${lane}.${endpoint} path`).toContain('endpoint-url');

            const wrongMethod = clone(good);
            wrongMethod.lanes[lane].endpoints[endpoint].method = wrongMethod.lanes[lane].endpoints[endpoint].method === 'GET' ? 'POST' : 'GET';
            expect(validateProviderLaneCompositionReceipt(wrongMethod).errors.map(error => error.code), `${lane}.${endpoint} method`).toContain('endpoint-contract');

            if (kind) {
                const wrongKind = clone(good);
                wrongKind.lanes[lane].endpoints[endpoint].kind = `${kind}-mutated`;
                expect(validateProviderLaneCompositionReceipt(wrongKind).errors.map(error => error.code), `${lane}.${endpoint} kind`).toContain('endpoint-contract')
            }

            for (const [field, value] of Object.entries(metadata)) {
                const wrongMetadata = clone(good);
                wrongMetadata.lanes[lane].endpoints[endpoint][field] = `${value}-mutated`;
                expect(validateProviderLaneCompositionReceipt(wrongMetadata).errors.map(error => error.code), `${lane}.${endpoint}.${field}`).toContain('endpoint-contract')
            }
        }

        for (const laneName of ['chat', 'embedding']) {
            const wrongOrigin = clone(good);
            const baseUrl     = `http://${wrongOrigin.lanes[laneName].serviceKey}:9999`;

            wrongOrigin.lanes[laneName].baseUrl = baseUrl;
            for (const endpoint of Object.values(wrongOrigin.lanes[laneName].endpoints)) {
                endpoint.url = `${baseUrl}${new URL(endpoint.url).pathname}`
            }
            for (const role of Object.values(wrongOrigin.roles)) {
                if (role.lane === laneName) role.baseUrl = baseUrl
            }

            expect(validateProviderLaneCompositionReceipt(wrongOrigin).errors.map(error => error.code), `${laneName} origin`).toContain('lane-base-url')
        }

        const missingEndpoint = clone(good);
        delete missingEndpoint.lanes.chat.endpoints.modelContext;
        expect(validateProviderLaneCompositionReceipt(missingEndpoint).errors.map(error => error.code)).toContain('endpoint-set');

        const extraEndpoint = clone(good);
        extraEndpoint.lanes.embedding.endpoints.foreign = {method: 'GET', url: 'http://embedding-model:8080/foreign'};
        expect(validateProviderLaneCompositionReceipt(extraEndpoint).errors.map(error => error.code)).toContain('endpoint-set');

        const missingField = clone(good);
        delete missingField.lanes.embedding.endpoints.workload.inputField;
        expect(validateProviderLaneCompositionReceipt(missingField).errors.map(error => error.code)).toContain('endpoint-field-set')
    });

    test('every existing Compose owner declares model, graph, and embedding selectors together', () => {
        const files = [
            'docker-compose.yml',
            'docker-compose.dev.yml',
            'docker-compose.local-agent-os.yml',
            'docker-compose.parity-ci.yml',
            'docker-compose.parity-capture.yml',
            'docker-compose.provider-lanes.yml',
            'docker-compose.test.yml'
        ];
        const selectorNames = ['NEO_MODEL_PROVIDER', 'NEO_GRAPH_PROVIDER', 'NEO_EMBEDDING_PROVIDER'];

        for (const file of files) {
            const source = fs.readFileSync(path.join(repoRoot, 'ai/deploy', file), 'utf8').replace(/!override\b/g, '');
            const doc    = loadYaml(source);

            for (const [serviceKey, service] of Object.entries(doc.services || {})) {
                const names = environmentNames(service);
                if (!selectorNames.some(name => names.includes(name))) continue;

                for (const name of selectorNames) {
                    expect(names, `${file}:${serviceKey} must declare ${name}`).toContain(name)
                }
            }
        }
    });

    test('the graph-role census equals independently discovered production call sites', () => {
        const roots = [
            path.join(repoRoot, 'ai/services'),
            path.join(repoRoot, 'ai/daemons')
        ];
        const productionCallers = roots.flatMap(walkMjsFiles).filter(file => {
            if (file.endsWith('/graph/providerDispatch.mjs')) return false;

            const source = fs.readFileSync(file, 'utf8');
            return source.includes('buildGraphProvider({') ||
                source.includes('resolveGraphModelProvider(aiConfig)') ||
                source.includes('getGraphProviderReadinessTarget(aiConfig)') ||
                source.includes("aiConfig.graphProvider === 'openAiCompatible'")
        }).map(file => path.relative(repoRoot, file)).sort();

        const receipt  = analyzeProviderLaneComposition(loadComposition());
        const declared = receipt.consumerCensus
            .filter(row => row.role === 'graph')
            .map(row => row.source)
            .sort();

        expect(declared).toEqual(productionCallers)
    });

    test('CLI parsing is narrow and rejects re-derivation inputs', () => {
        expect(parseArgs([])).toEqual({input: null, verifySources: true});
        expect(parseArgs(['--input', 'composition.json', '--skip-source-census']))
            .toEqual({input: 'composition.json', verifySources: false});
        expect(() => parseArgs(['--compose-file', 'compose.yml'])).toThrow("Unknown argument '--compose-file'")
    })
});
