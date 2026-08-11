import {setup} from '../../../../setup.mjs';

const appName = 'SearchServiceTest';

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

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import InstanceManager         from '../../../../../../src/manager/Instance.mjs';
import fs                      from 'fs-extra';
import path                    from 'path';
import {PROVIDER_TIMEOUT_CODE} from '../../../../../../ai/provider/createTimeoutError.mjs';

/**
 * @summary Regression coverage for the SearchService type-filter synthesis bug.
 *
 * Before the fix, `SearchService.ask` piped chunk source paths directly into `fs.pathExists` /
 * `fs.readFile` without resolving relatives against `neoRootDir`. LearningSource emits absolute
 * paths (worked), ApiSource emits relative paths (failed), so any query filtered by `type='src'`
 * or `type='ai-infrastructure'` saw `No Content (File missing or empty)` context and the
 * synthesis LLM returned placeholder `"I don't have enough information"` answers despite
 * references being correctly retrieved.
 */
test.describe('Neo.ai.services.knowledge-base.SearchService', () => {
    let SearchService;
    let QueryService;
    let aiConfig;
    let originalQueryDocuments;
    let originalModel;
    let originalTransport;
    let tmpFilePath;
    let tmpFileRelativeToRoot;
    const tmpFileContents = 'MOCK_FILE_CONTENT_abc123 — the SearchService should read this verbatim';

    test.beforeAll(async () => {
        aiConfig      = (await import('../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
        QueryService  = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;
        SearchService = (await import('../../../../../../ai/services/knowledge-base/SearchService.mjs')).default;

        // Create a fixture file inside neoRootDir so we can exercise the relative-path resolution.
        const tmpDir = path.resolve(aiConfig.neoRootDir, 'tmp', `search-service-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpDir);
        tmpFilePath           = path.join(tmpDir, 'fixture-source.mjs');
        tmpFileRelativeToRoot = path.relative(aiConfig.neoRootDir, tmpFilePath);
        await fs.writeFile(tmpFilePath, tmpFileContents, 'utf-8');

        originalQueryDocuments = QueryService.queryDocuments.bind(QueryService);
        originalModel          = SearchService.model;
        originalTransport      = aiConfig.transport;
    });

    test.afterAll(async () => {
        QueryService.queryDocuments = originalQueryDocuments;
        SearchService.model         = originalModel;
        aiConfig.transport          = originalTransport;
        if (tmpFilePath) await fs.remove(path.dirname(tmpFilePath)).catch(() => {});
    });

    test('ask resolves RELATIVE ref.source against neoRootDir and feeds real content to synthesis', async () => {
        let capturedPrompt = null;

        // Stub QueryService to return a single reference with a relative source path —
        // the exact shape ApiSource emits for ai/ and src/ chunks.
        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '1234'}]
        });

        // Stub the synthesis model to capture the prompt rather than hit Gemini.
        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'fixture test query', type: 'src'});

        expect(result.answer).toBe('mocked-answer');
        expect(result.references).toHaveLength(1);
        expect(result.references[0].source).toBe(tmpFileRelativeToRoot);

        // The prompt must contain the ACTUAL file content, not the "No Content" placeholder.
        // This is the regression guard for relative source hydration.
        expect(capturedPrompt).toContain(tmpFileContents);
        expect(capturedPrompt).not.toContain('No Content (File missing or empty)');
    });

    test('ask still honors ABSOLUTE ref.source paths without regression', async () => {
        let capturedPrompt = null;

        // LearningSource emits absolute paths — verify they continue to work after the fix.
        QueryService.queryDocuments = async () => ({
            topResult: tmpFilePath,
            results  : [{source: tmpFilePath, score: '999'}]
        });

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'absolute-path fixture query', type: 'all'});

        expect(result.answer).toBe('mocked-answer');
        expect(capturedPrompt).toContain(tmpFileContents);
        expect(capturedPrompt).not.toContain('No Content (File missing or empty)');
    });

    test('ask hydrates non-local tenant references from embedded metadata content', async () => {
        let capturedPrompt = null;

        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{
                source  : tmpFileRelativeToRoot,
                score   : '777',
                metadata: {
                    content : 'TENANT_EMBEDDED_CONTENT_from_metadata',
                    repoSlug: 'tenant-app',
                    tenantId: 'tenant-a'
                }
            }]
        });

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'tenant fixture query', type: 'src'});

        expect(result.answer).toBe('mocked-answer');
        expect(result.references[0]).not.toHaveProperty('metadata');
        expect(capturedPrompt).toContain('TENANT_EMBEDDED_CONTENT_from_metadata');
        expect(capturedPrompt).not.toContain(tmpFileContents);
    });

    test('ask keeps default Neo references hydrated from the local checkout', async () => {
        let capturedPrompt = null;

        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{
                source  : tmpFileRelativeToRoot,
                score   : '777',
                metadata: {
                    content : 'STALE_METADATA_CONTENT_should_not_win_for_default_neo',
                    repoSlug: 'neo',
                    tenantId: 'neo-shared'
                }
            }]
        });

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'default fixture query', type: 'src'});

        expect(result.answer).toBe('mocked-answer');
        expect(capturedPrompt).toContain(tmpFileContents);
        expect(capturedPrompt).not.toContain('STALE_METADATA_CONTENT_should_not_win_for_default_neo');
    });

    test('ask refuses neoRootDir fallback for non-local tenant references without embedded content', async () => {
        let capturedPrompt = null;

        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{
                source  : tmpFileRelativeToRoot,
                score   : '777',
                metadata: {
                    repoSlug: 'tenant-app',
                    tenantId: 'tenant-a'
                }
            }]
        });

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'tenant missing content query', type: 'src'});

        expect(result.answer).toBe('mocked-answer');
        expect(capturedPrompt).toContain('No Content (File missing or empty)');
        expect(capturedPrompt).not.toContain(tmpFileContents);
    });

    test('ask logs a warning and falls back to placeholder when the resolved path does not exist', async () => {
        let capturedPrompt = null;

        QueryService.queryDocuments = async () => ({
            topResult: 'this/path/definitely/does/not/exist.mjs',
            results  : [{source: 'this/path/definitely/does/not/exist.mjs', score: '100'}]
        });

        SearchService.model = {
            generateContent: async (prompt) => {
                capturedPrompt = prompt;
                return {response: {text: () => 'mocked-answer'}};
            }
        };

        const result = await SearchService.ask({query: 'missing file fixture', type: 'src'});

        expect(result.answer).toBe('mocked-answer');
        // Fallback should kick in for genuinely-missing files.
        expect(capturedPrompt).toContain('No Content (File missing or empty)');
    });

    test('ask returns degraded references when synthesis rejects after retrieval', async () => {
        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '1234'}]
        });

        SearchService.model = {
            generateContent: async () => {
                throw new Error('quota 429 AIza123456789012345678901234567890');
            }
        };

        const result = await SearchService.ask({query: 'provider quota fixture', type: 'src'});

        expect(result.degraded).toBe(true);
        expect(result.degradedCode).toBe('synthesis_failed');
        expect(result.reason).toContain('quota 429');
        expect(result.reason).toContain('[redacted-api-key]');
        expect(result.answer).toContain('Knowledge-base retrieval succeeded');
        expect(result.references).toEqual([{
            name  : path.basename(tmpFileRelativeToRoot),
            source: tmpFileRelativeToRoot,
            score : 1234
        }]);
    });

    test('ask returns degraded references when no synthesis model is configured', async () => {
        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '321'}]
        });

        SearchService.model = null;

        const result = await SearchService.ask({query: 'missing model fixture', type: 'src'});

        expect(result.degraded).toBe(true);
        expect(result.degradedCode).toBe('no_provider');
        expect(result.reason).toBe('GEMINI_API_KEY is required for RAG features.');
        expect(result.references[0]).toMatchObject({
            source: tmpFileRelativeToRoot,
            score : 321
        });
    });

    test('ask passes the interactive budget and returns degraded references when synthesis times out', async () => {
        let capturedOptions = null;

        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '1234'}]
        });

        // Simulate the active chat provider aborting on the interactive contention budget — the shape
        // OpenAiCompatible.generate / Ollama.generate throw once options.timeoutMs is exceeded.
        SearchService.model = {
            generateContent: async (prompt, options) => {
                capturedOptions = options;
                throw new Error('[Ollama] ask_knowledge_base synthesis timed out after 30000ms (host=http://127.0.0.1:11434, model=gemma4:26b)');
            }
        };

        const result = await SearchService.ask({query: 'contention timeout fixture', type: 'src'});

        // Wiring: ask must pass the interactive budget + a safe operation label to the provider.
        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.operationLabel).toBe('ask_knowledge_base synthesis');
        expect(capturedOptions.operationStage).toBe('kb-ask-synthesis');
        expect(Object.prototype.hasOwnProperty.call(capturedOptions, 'timeoutMs')).toBe(true);

        // Degraded envelope: references preserved, bounded timeout reason, never collapses to "no documents".
        expect(result.degraded).toBe(true);
        expect(result.degradedCode).toBe('synthesis_timeout');
        expect(result.reason).toContain('timed out');
        expect(result.answer).toContain('Knowledge-base retrieval succeeded');
        expect(result.answer).not.toContain('No relevant documents found');
        expect(result.references).toEqual([{
            name  : path.basename(tmpFileRelativeToRoot),
            source: tmpFileRelativeToRoot,
            score : 1234
        }]);
    });

    test('ask derives synthesis_timeout structurally from PROVIDER_TIMEOUT_CODE, regex-independent', async () => {
        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '1234'}]
        });

        // The provider-timeout error carries the uniform `error.code`; the message deliberately does
        // NOT say "timed out", proving degradedCode comes from the structural code, not the regex fallback.
        SearchService.model = {
            generateContent: async () => {
                const err = new Error('upstream request aborted by the interactive budget');
                err.code = PROVIDER_TIMEOUT_CODE;
                throw err;
            }
        };

        const result = await SearchService.ask({query: 'structural timeout fixture', type: 'src'});

        expect(result.degraded).toBe(true);
        expect(result.degradedCode).toBe('synthesis_timeout');
    });

    test('composes query embedding before synthesis and skips synthesis on an empty result', async () => {
        const
            ChromaManager                  = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default,
            TextEmbeddingService           = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default,
            originalGetCollection          = ChromaManager.getKnowledgeBaseCollection,
            originalEmbedText              = TextEmbeddingService.embedText,
            originalAddLexicalRescueScores = QueryService.addLexicalRescueScores;

        let metadatas = [{
                source          : tmpFileRelativeToRoot,
                type            : 'src',
                name            : 'fixture-source',
                inheritanceChain: '[]'
            }],
            stages         = [],
            synthesisCalls = 0;

        QueryService.queryDocuments = originalQueryDocuments;
        QueryService.addLexicalRescueScores = async () => {};
        TextEmbeddingService.embedText = async (query, provider, options) => {
            stages.push(options.operationStage);
            return [0.1, 0.2, 0.3];
        };
        ChromaManager.getKnowledgeBaseCollection = async () => ({
            count: async () => 1,
            query: async () => ({metadatas: [metadatas]})
        });
        SearchService.model = {
            generateContent: async (prompt, options) => {
                synthesisCalls++;
                stages.push(options.operationStage);
                return {response: {text: () => 'composed-answer'}};
            }
        };

        try {
            const withReferences = await SearchService.ask({query: 'composed fixture', type: 'src'});

            expect(withReferences.answer).toBe('composed-answer');
            expect(stages).toEqual(['kb-query-embedding', 'kb-ask-synthesis']);
            expect(synthesisCalls).toBe(1);

            stages    = [];
            metadatas = [];

            const empty = await SearchService.ask({query: 'empty composed fixture', type: 'src'});

            expect(empty.references).toEqual([]);
            expect(stages).toEqual(['kb-query-embedding']);
            expect(synthesisCalls).toBe(1);
        } finally {
            QueryService.queryDocuments = originalQueryDocuments;
            QueryService.addLexicalRescueScores = originalAddLexicalRescueScores;
            TextEmbeddingService.embedText = originalEmbedText;
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
            SearchService.model = originalModel;
        }
    });

    test('ask names the download/sync one-liners when the collection is EMPTY (post npm-prepare decouple cold-start)', async () => {
        const ChromaManager         = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        const originalGetCollection = ChromaManager.getKnowledgeBaseCollection;
        let   synthesisCalls        = 0;

        QueryService.queryDocuments = async () => ({results: []});
        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 0});
        SearchService.model = {
            async generateContent() {
                synthesisCalls++;
                return {response: {text: () => 'must not run'}};
            }
        };

        try {
            const result = await SearchService.ask({query: 'anything'});

            expect(result.answer).toContain('npm run ai:download-kb');
            expect(result.answer).toContain('npm run ai:sync-kb');
            expect(result.references).toEqual([]);
            expect(synthesisCalls).toBe(0);
        } finally {
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        }
    });

    test('ask points remote empty collections at tenant-ingestion diagnostics', async () => {
        const ChromaManager         = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        const originalGetCollection = ChromaManager.getKnowledgeBaseCollection;

        QueryService.queryDocuments = async () => ({results: []});
        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 0});
        aiConfig.transport = 'streamable-http';

        try {
            const result = await SearchService.ask({query: 'anything'});

            expect(result.answer).toContain('get_ingestion_progress()');
            expect(result.answer).toContain('inspect_deployment');
            expect(result.answer).toContain('get_deployment_state_snapshot');
            expect(result.answer).toContain('tenantRepoSync');
            expect(result.answer).toContain('ingest_source_files');
            expect(result.answer).not.toContain('npm run ai:download-kb');
            expect(result.references).toEqual([]);
        } finally {
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
            aiConfig.transport = originalTransport;
        }
    });

    test('ask falls back to the generic no-documents answer when the count probe errors', async () => {
        const ChromaManager         = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        const originalGetCollection = ChromaManager.getKnowledgeBaseCollection;

        QueryService.queryDocuments = async () => ({results: []});
        ChromaManager.getKnowledgeBaseCollection = async () => { throw new Error('chroma down'); };

        try {
            const result = await SearchService.ask({query: 'anything'});

            expect(result.answer).toBe('No relevant documents found in the knowledge base.');
            expect(result.references).toEqual([]);
        } finally {
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        }
    });

    test('ask keeps the generic no-documents answer when the collection has documents but none match', async () => {
        const ChromaManager         = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        const originalGetCollection = ChromaManager.getKnowledgeBaseCollection;

        QueryService.queryDocuments = async () => ({results: []});
        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 28398});

        try {
            const result = await SearchService.ask({query: 'anything'});

            expect(result.answer).toBe('No relevant documents found in the knowledge base.');
        } finally {
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        }
    });

    /**
     * @summary A host override must not inherit the displaced endpoint's credential.
     *
     * @neo-gpt's falsifier, pinned. The first repair here removed the GEMINI key from the
     * OpenAI-compatible branch and I described the credential boundary as closed. It was not: the
     * documented local override `NEO_KB_ASK_BASE_URL` moved the HOST while the Tier-1
     * `openAiCompatible.apiKey` stayed attached, so a managed `sk-remote` was emitted as
     * `Authorization: Bearer sk-remote` at a local LM Studio. One cross-provider leak closed, one
     * cross-endpoint leak opened, same shape.
     *
     * Driven through the exported producer with real config shapes, so it fails on the PRODUCER
     * rather than on a value the test recomputed.
     */
    test('#16932: an ask.baseUrl override gets the LOCAL host and NO inherited Tier-1 key', async () => {
        const {buildAskProviderConfigs} = await import('../../../../../../ai/services/knowledge-base/SearchService.mjs');

        const {openAiCompatibleConfig} = buildAskProviderConfigs({
            askSynthesis    : {baseUrl: 'http://127.0.0.1:1234', model: 'google/gemma-4-26b-a4b', apiKey: 'gemini-key'},
            openAiCompatible: {host: 'https://managed.example', apiKey: 'sk-remote', keep_alive: -1},
            ollama          : {host: 'http://127.0.0.1:11434', keep_alive: -1}
        });

        expect(openAiCompatibleConfig.host, 'the override must win the host').toBe('http://127.0.0.1:1234');
        expect(openAiCompatibleConfig.apiKey,
            'the displaced Tier-1 credential must NOT travel to the override host').toBe('');
        expect(openAiCompatibleConfig.apiKey,
            'and the Gemini ask key must never reach this branch either').not.toBe('gemini-key')
    });

    test('#16932: NON-VACUITY — with NO override, the Tier-1 host keeps its OWN key', async () => {
        // Without this, the arm above passes against a producer that simply never sends a key —
        // which would break every managed OpenAI-compatible deployment while looking secure.
        const {buildAskProviderConfigs} = await import('../../../../../../ai/services/knowledge-base/SearchService.mjs');

        const {openAiCompatibleConfig} = buildAskProviderConfigs({
            askSynthesis    : {baseUrl: null, model: 'google/gemma-4-26b-a4b', apiKey: 'gemini-key'},
            openAiCompatible: {host: 'https://managed.example', apiKey: 'sk-remote', keep_alive: -1},
            ollama          : {host: 'http://127.0.0.1:11434', keep_alive: -1}
        });

        expect(openAiCompatibleConfig.host).toBe('https://managed.example');
        expect(openAiCompatibleConfig.apiKey,
            'an un-displaced endpoint keeps its own credential').toBe('sk-remote')
    });

    test('an over-budget ask DELIVERS the truncation notice on the RETURNED ANSWER', async () => {
        // The acceptance criterion requires the notice on the RETURNED ANSWER TEXT, and
        // every arm written before this one asserted the helper's internal `notice` instead. An exact-head
        // positive-control search found many real `SearchService.ask()` specs and ZERO references to
        // `assembled.truncated` or the emitted note — so deleting the append in `ask()` left the whole
        // suite green. I tested the notice's CONSTRUCTION and called it the AC's DELIVERY.
        //
        // This arm is production-shaped: real hydration through a real oversized file, the bound at its
        // declared default, and the assertion on what a CALLER receives.
        const bigFile = path.join(path.dirname(tmpFilePath), 'oversized-source.mjs'),
              // Comfortably past the 12000-char per-document cap, so truncation is certain rather than
              // tuned to the exact boundary — a boundary-hugging fixture would flip on a default change.
              bigBody = 'X'.repeat(20000);

        await fs.writeFile(bigFile, bigBody, 'utf-8');

        const bigRelative = path.relative(aiConfig.neoRootDir, bigFile);

        QueryService.queryDocuments = async () => ({
            topResult: bigRelative,
            results  : [{source: bigRelative, score: '1234'}]
        });

        SearchService.model = {
            generateContent: async () => ({response: {text: () => 'mocked-answer'}})
        };

        const result = await SearchService.ask({query: 'oversized fixture query', type: 'src'});

        expect(result.answer).toContain('mocked-answer');
        expect(result.answer, 'the caller is TOLD the context was cut').toContain('Context note:');
        expect(result.answer).toContain('were shortened');

        // NON-VACUITY / control: an UNDER-budget ask must carry no notice at all. Without this, an
        // implementation that appended the note unconditionally would satisfy every assertion above
        // while making the notice meaningless.
        QueryService.queryDocuments = async () => ({
            topResult: tmpFileRelativeToRoot,
            results  : [{source: tmpFileRelativeToRoot, score: '999'}]
        });

        const small = await SearchService.ask({query: 'small fixture query', type: 'src'});

        expect(small.answer).toBe('mocked-answer');
        expect(small.answer, 'an in-budget ask is unchanged').not.toContain('Context note:');

        await fs.remove(bigFile).catch(() => {});
    });

    test('the DECLARED ask context budget reaches a consumer — the bound is not silently disabled', async () => {
        // @neo-opus-ada's review asked the deciding question: does a newly added leaf resolve to
        // `undefined` on an overlay that predates it, or does the declared default apply? If the
        // default applies, a `|| 0` at the use site is dead code that can only disable the bound.
        //
        // It applies. The generated `config.mjs` is a thin singleton extending `ConfigBase` that
        // declares no data of its own — "Defaults and formulas live in ConfigBase; this class only
        // claims the runtime namespace" — so a leaf added to the tracked base reaches every overlay.
        // This arm pins it: if declared defaults ever stop arriving at a consumer, the budget becomes
        // a no-op that ships green, and nothing else in the suite would say so.
        expect(aiConfig.askSynthesis.contextBudgetChars,
            'the declared total budget resolves for a consumer').toBe(48000);
        expect(aiConfig.askSynthesis.contextMaxCharsPerDocument,
            'the declared per-document cap resolves for a consumer').toBe(12000);

        // NON-VACUITY: `0` would satisfy "a number resolved" while disabling the feature, so the arm
        // asserts usable bounds rather than mere presence — and that the per-document cap actually
        // constrains something inside the total.
        expect(aiConfig.askSynthesis.contextBudgetChars).toBeGreaterThan(0);
        expect(aiConfig.askSynthesis.contextMaxCharsPerDocument).toBeGreaterThan(0);
        expect(aiConfig.askSynthesis.contextMaxCharsPerDocument)
            .toBeLessThan(aiConfig.askSynthesis.contextBudgetChars)
    });

    test('ask owns an admission queue sized by maxParallel, defaulting to serialized', async () => {
        const {buildAskRequestQueue} = await import('../../../../../../ai/services/knowledge-base/SearchService.mjs');

        expect(buildAskRequestQueue({askSynthesis: {maxParallel: 3}}).capacity,
            'the operator-set parallelism reaches the queue').toBe(3);

        // NON-VACUITY: a second, different value — otherwise the arm would pass against a hardcoded
        // constant and prove nothing about the leaf being read at all.
        expect(buildAskRequestQueue({askSynthesis: {maxParallel: 1}}).capacity,
            'the serialized default is read, not assumed').toBe(1);

        // A missing leaf lands on the QUEUE PRIMITIVE's own documented default of 1, not on a second
        // fallback inside this builder — which is the distinction worth pinning. It cannot happen in
        // production anyway, since the declared default inherits to every overlay; the arm exists so
        // that a future `|| N` added here would fail rather than pass silently.
        expect(buildAskRequestQueue({askSynthesis: {}}).capacity,
            'no builder-local fallback — the primitive default applies').toBe(1);

        // An UNUSABLE capacity is refused at construction rather than clamped, so an operator typo
        // fails loudly instead of quietly serializing a deployment that asked for parallelism.
        expect(() => buildAskRequestQueue({askSynthesis: {maxParallel: 0}}))
            .toThrow(/capacity must be an integer >= 1/)
    });
});
