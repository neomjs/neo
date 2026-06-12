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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';
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
    let tmpFilePath;
    let tmpFileRelativeToRoot;
    const tmpFileContents = 'MOCK_FILE_CONTENT_abc123 — the SearchService should read this verbatim';

    test.beforeAll(async () => {
        aiConfig      = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
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
    });

    test.afterAll(async () => {
        QueryService.queryDocuments = originalQueryDocuments;
        SearchService.model         = originalModel;
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
                throw new Error('[Ollama] ask_knowledge_base synthesis timed out after 30000ms (host=http://127.0.0.1:11434, model=gemma4:31b)');
            }
        };

        const result = await SearchService.ask({query: 'contention timeout fixture', type: 'src'});

        // Wiring: ask must pass the interactive budget + a safe operation label to the provider.
        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.operationLabel).toBe('ask_knowledge_base synthesis');
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

    test('ask names the download/sync one-liners when the collection is EMPTY (post npm-prepare decouple cold-start)', async () => {
        const ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
        const originalGetCollection = ChromaManager.getKnowledgeBaseCollection;

        QueryService.queryDocuments = async () => ({results: []});
        ChromaManager.getKnowledgeBaseCollection = async () => ({count: async () => 0});

        try {
            const result = await SearchService.ask({query: 'anything'});

            expect(result.answer).toContain('npm run ai:download-kb');
            expect(result.answer).toContain('npm run ai:sync-kb');
            expect(result.references).toEqual([]);
        } finally {
            ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        }
    });

    test('ask falls back to the generic no-documents answer when the count probe errors', async () => {
        const ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
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
        const ChromaManager = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;
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
});
