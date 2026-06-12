import {setup} from '../../../../setup.mjs';

const appName = 'SessionServiceBuildChatModelTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('buildChatModel provider selector (#11965 Sub-2)', () => {
    let buildChatModel;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/provider/buildChatModel.mjs');
        buildChatModel = mod.buildChatModel;
    });

    test('throws for unsupported modelProvider (no silent Gemini fallthrough)', () => {
        expect(() => buildChatModel({
            modelProvider: 'bogus-provider'
        })).toThrow(/unsupported modelProvider 'bogus-provider'.*Expected one of.*gemini.*openAiCompatible.*ollama/);

        expect(() => buildChatModel({
            modelProvider: 'mystery'
        })).toThrow(/unsupported modelProvider 'mystery'/);
    });

    test('buildChatModel has no static provider imports (#12763)', async () => {
        const source = await fs.readFile(new URL('../../../../../../ai/provider/buildChatModel.mjs', import.meta.url), 'utf8');

        expect(source).not.toMatch(/^import\s+.*@google\/generative-ai/m);
        expect(source).not.toMatch(/^import\s+.*\.\/Ollama\.mjs/m);
        expect(source).not.toMatch(/^import\s+.*\.\/OpenAiCompatible\.mjs/m);
        expect(source).not.toContain('http://127.0.0.1:11434');
        expect(source).not.toContain("'gemma4'");
    });

    test('modelProvider=ollama returns generateContent wrapping native Ollama provider', async () => {
        const captured = [];
        const fakeOllama = {
            host         : 'fake://injected',
            modelName    : 'fake-injected',
            keepAlive    : null,
            async generate(promptText) {
                captured.push({promptText, host: this.host, modelName: this.modelName, keepAlive: this.keepAlive});
                return {content: 'fake-content-for: ' + promptText, raw: {message: {content: 'fake-content-for: ' + promptText}}};
            }
        };

        const model = buildChatModel({
            modelProvider          : 'ollama',
            ollamaConfig           : {host: 'http://ollama.test', model: 'test-gemma', embeddingModel: null, keep_alive: -1},
            ollamaProviderFactory  : (cfg) => {
                fakeOllama.host      = cfg.host;
                fakeOllama.modelName = cfg.modelName;
                fakeOllama.keepAlive = cfg.keepAlive;
                return fakeOllama;
            }
        });

        expect(model).toBeTruthy();
        expect(typeof model.generateContent).toBe('function');

        const response = await model.generateContent('hello world');

        // Envelope shape: Gemini-compatible {response: {text()}}.
        expect(typeof response.response.text).toBe('function');
        expect(response.response.text()).toBe('fake-content-for: hello world');

        // Provider received the host/model from injected config.
        expect(captured).toHaveLength(1);
        expect(captured[0]).toEqual({
            promptText: 'hello world',
            host      : 'http://ollama.test',
            modelName : 'test-gemma',
            keepAlive : -1
        });
    });

    test('modelProvider=ollama refreshes provider host/model/keepAlive per invocation', async () => {
        const captured = [];
        const fakeOllama = {
            host     : null,
            modelName: null,
            keepAlive: null,
            async generate(promptText) {
                captured.push({promptText, host: this.host, modelName: this.modelName, keepAlive: this.keepAlive});
                return {content: 'r:' + promptText};
            }
        };

        // Pass a mutable ollamaConfig ref so we can change it between invocations.
        const ollamaConfig = {host: 'http://v1.test', model: 'model-v1', keep_alive: -1};
        const model = buildChatModel({
            modelProvider         : 'ollama',
            ollamaConfig,
            ollamaProviderFactory : () => fakeOllama
        });

        await model.generateContent('first');
        ollamaConfig.host  = 'http://v2.test';
        ollamaConfig.model = 'model-v2';
        ollamaConfig.keep_alive = 0;
        await model.generateContent('second');

        expect(captured).toEqual([
            {promptText: 'first',  host: 'http://v1.test', modelName: 'model-v1', keepAlive: -1},
            {promptText: 'second', host: 'http://v2.test', modelName: 'model-v2', keepAlive: 0}
        ]);
    });

    test('modelProvider=openAiCompatible returns generateContent wrapping OpenAi-compatible provider', async () => {
        const captured = [];
        const fakeProvider = {
            host     : null,
            modelName: null,
            apiKey   : null,
            keepAlive: null,
            async generate(promptText, generationOptions) {
                captured.push({promptText, generationOptions, host: this.host, modelName: this.modelName, apiKey: this.apiKey, keepAlive: this.keepAlive});
                return {content: 'oai:' + promptText};
            }
        };

        const model = buildChatModel({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', apiKey: 'sk-test', model: 'oai-model', keep_alive: -1},
            openAiCompatibleProviderFactory: () => fakeProvider
        });

        expect(model).toBeTruthy();
        const response = await model.generateContent('hello', {
            operationLabel: 'miniSummary generation',
            timeoutMs     : 4000
        });
        expect(response.response.text()).toBe('oai:hello');
        expect(captured[0]).toMatchObject({
            host             : 'http://oai.test',
            modelName        : 'oai-model',
            apiKey           : 'sk-test',
            keepAlive        : -1,
            generationOptions: {
                operationLabel: 'miniSummary generation',
                timeoutMs     : 4000
            }
        });
    });

    test('modelProvider=openAiCompatible delays provider construction until generateContent (#12763)', async () => {
        const factoryCalls = [];
        const fakeProvider = {
            async generate(promptText) {
                return {content: 'lazy:' + promptText};
            }
        };

        const model = buildChatModel({
            modelProvider                  : 'openAiCompatible',
            openAiCompatibleConfig         : {host: 'http://oai.test', model: 'lazy-model'},
            openAiCompatibleProviderFactory: (cfg) => {
                factoryCalls.push(cfg);
                return fakeProvider;
            },
            geminiClientFactory            : () => { throw new Error('Gemini must not be constructed for local providers'); }
        });

        expect(factoryCalls).toEqual([]);

        const response = await model.generateContent('hello');

        expect(response.response.text()).toBe('lazy:hello');
        expect(factoryCalls).toEqual([{
            host     : 'http://oai.test',
            modelName: 'lazy-model',
            apiKey   : undefined
        }]);
    });

    test('local provider is used even when a Gemini key is present — key does not override the configured provider (#12741)', async () => {
        const fakeProvider = {async generate(promptText) { return {content: 'local:' + promptText}; }};

        const model = buildChatModel({
            modelProvider                  : 'openAiCompatible',
            geminiApiKey                   : 'AIza-present-but-ignored',
            geminiModelName                : 'gemini-3.5-flash',
            openAiCompatibleConfig         : {host: 'http://lms.local:1234', model: 'local-chat', keep_alive: -1},
            openAiCompatibleProviderFactory: () => fakeProvider,
            geminiClientFactory            : () => { throw new Error('Gemini must not be constructed when modelProvider=openAiCompatible'); }
        });

        const response = await model.generateContent('hello');
        // Resolved to the configured local provider, NOT Gemini, despite the key being present.
        expect(response.response.text()).toBe('local:hello');
    });

    test('modelProvider=gemini returns null when geminiApiKey is missing', () => {
        const model = buildChatModel({
            modelProvider: 'gemini',
            geminiApiKey : null
        });
        expect(model).toBe(null);
    });

    test('modelProvider=gemini delegates to geminiClientFactory when key present', () => {
        const fakeGemini = {generateContent: async () => ({response: {text: () => 'gemini-mock'}})};
        const factoryCalls = [];
        const model = buildChatModel({
            modelProvider       : 'gemini',
            geminiApiKey        : 'gem-key',
            geminiModelName     : 'gemini-pro',
            geminiClientFactory : (apiKey, modelName) => {
                factoryCalls.push({apiKey, modelName});
                return fakeGemini;
            }
        });
        expect(model).toBe(fakeGemini);
        expect(factoryCalls).toEqual([{apiKey: 'gem-key', modelName: 'gemini-pro'}]);
    });
});

test.describe('SessionService summary provenance (#10292)', () => {
    let GraphService;
    let RequestContextService;
    let SessionService;

    let originalIngestAntigravityArtifacts;
    let originalLinkNodes;
    let originalMemoryCollection;
    let originalModel;
    let originalSessionsCollection;
    let originalUpsertNode;

    let linkNodesCalls;
    let sessionUpserts;
    let upsertNodeCalls;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/memory-core/SessionService.mjs');

        SessionService        = mod.default;
        GraphService          = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
    });

    test.beforeEach(() => {
        linkNodesCalls = [];
        sessionUpserts = [];
        upsertNodeCalls = [];

        originalIngestAntigravityArtifacts = SessionService.ingestAntigravityArtifacts;
        originalMemoryCollection           = SessionService.memoryCollection;
        originalModel                      = SessionService.model;
        originalSessionsCollection         = SessionService.sessionsCollection;
        originalLinkNodes                  = GraphService.linkNodes;
        originalUpsertNode                 = GraphService.upsertNode;

        SessionService.ingestAntigravityArtifacts = async () => {};
        SessionService.memoryCollection = {
            async get() {
                return {
                    ids      : ['memory-1', 'memory-2', 'memory-3'],
                    documents: [
                        'User Prompt: work on #10292',
                        'Agent Thought: peer-trusted source',
                        'Agent Response: unclassified source'
                    ],
                    metadatas: [{
                        timestamp    : 10,
                        agent        : 'neo-gpt',
                        model        : 'gpt-5.5',
                        agentIdentity: '@neo-gpt'
                    }, {
                        timestamp    : 20,
                        agent        : 'external-contributor',
                        model        : 'unknown',
                        agentIdentity: '@external-contributor'
                    }, {
                        timestamp: 30
                    }]
                };
            }
        };
        SessionService.sessionsCollection = {
            async upsert(payload) {
                sessionUpserts.push(payload);
            }
        };
        SessionService.model = {
            async generateContent() {
                return {
                    response: {
                        text: () => JSON.stringify({
                            summary     : 'Summary mentions #10292.',
                            title       : 'Summary Provenance',
                            category    : 'feature',
                            quality     : 80,
                            productivity: 75,
                            impact      : 70,
                            complexity  : 55,
                            technologies: ['memory-core']
                        })
                    }
                };
            }
        };

        GraphService.linkNodes = (...args) => {
            linkNodesCalls.push(args);
        };
        GraphService.upsertNode = (node) => {
            upsertNodeCalls.push(node);
        };
    });

    test.afterEach(() => {
        SessionService.ingestAntigravityArtifacts = originalIngestAntigravityArtifacts;
        SessionService.memoryCollection           = originalMemoryCollection;
        SessionService.model                      = originalModel;
        SessionService.sessionsCollection         = originalSessionsCollection;
        GraphService.linkNodes                    = originalLinkNodes;
        GraphService.upsertNode                   = originalUpsertNode;
    });

    test('resolveSummarySourceProvenance uses the most restrictive source tier', () => {
        const result = SessionService.constructor.resolveSummarySourceProvenance([
            {agentIdentity: '@tobiu'},
            {agentIdentity: '@neo-gpt'},
            {agentIdentity: '@external-contributor'},
            {}
        ]);

        expect(result.sourceAgentIdentities).toEqual(['@tobiu', '@neo-gpt', '@external-contributor']);
        expect(result.sourceTrustTier).toBe('unclassified');
        expect(result.unclassifiedSourceCount).toBe(2);
    });

    test('summarizeSession stamps summary provenance without laundering source trust', async () => {
        const result = await RequestContextService.run({
            userId             : 'tobiu',
            username           : 'Tobias',
            agentIdentityNodeId: '@tobiu',
            source             : 'oidc'
        }, () => SessionService.summarizeSession('summary-provenance-session'));

        expect(result.summaryId).toBe('summary_summary-provenance-session');

        expect(sessionUpserts).toHaveLength(1);
        const metadata = sessionUpserts[0].metadatas[0];

        expect(metadata.sourceAgentIdentities).toBe('@neo-gpt,@external-contributor');
        expect(metadata.sourceTrustTier).toBe('unclassified');
        expect(metadata.provenancePolicy).toBe('most-restrictive-source');
        expect(metadata.unclassifiedSourceCount).toBe(2);

        const summaryNode = upsertNodeCalls.find(node => node.id === result.summaryId);
        expect(summaryNode.properties).toMatchObject({
            sourceAgentIdentities: ['@neo-gpt', '@external-contributor'],
            sourceTrustTier      : 'unclassified',
            provenancePolicy     : 'most-restrictive-source'
        });

        const authoredByEdges = linkNodesCalls.filter(([, , relationship]) => relationship === 'AUTHORED_BY');
        expect(authoredByEdges).toHaveLength(1);
        expect(authoredByEdges[0][0]).toBe(result.summaryId);
        expect(authoredByEdges[0][1]).toBe('@neo-gpt');
        expect(authoredByEdges[0][4]).toMatchObject({
            userId          : '@neo-gpt',
            sharedEntity    : true,
            provenancePolicy: 'most-restrictive-source'
        });

        expect(authoredByEdges.some(([, target]) => target === '@tobiu')).toBe(false);
        expect(authoredByEdges.some(([, target]) => target === '@external-contributor')).toBe(false);
    });
});
