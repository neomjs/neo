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
    NEO_PROVIDER_LANE_EMBEDDING_CONTEXT_TOKENS_PER_SLOT_REQUIRED: '32768'
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
            endpoints    : {workload: {kind: 'ollamaChat', url: 'http://chat-model:11434/api/chat'}}
        });
        expect(receipt.lanes.embedding).toMatchObject({
            serviceKey: 'embedding-model',
            dnsName   : 'embedding-model',
            provider  : 'openAiCompatible',
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
        contextMutation.services['embedding-model'].environment.LLAMA_ARG_N_PARALLEL = '2';
        const contextReceipt = analyzeProviderLaneComposition(contextMutation);
        expect(errorCodes(contextReceipt)).toContain('context-allocation')
    });

    test('the llama.cpp slot oracle is required and cannot be description-only', () => {
        const composition = loadComposition();
        delete composition.services['embedding-model'].environment.LLAMA_ARG_ENDPOINT_SLOTS;

        const receipt = analyzeProviderLaneComposition(composition);
        expect(receipt.ready).toBe(false);
        expect(errorCodes(receipt)).toContain('slots-endpoint-disabled')
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
