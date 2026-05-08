import {setup} from '../../../../setup.mjs';

const appName = 'KBWorkVolumeBranchingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Work-volume branching coverage for `VectorService.embed` (#10572).
 *
 * Verifies the post-delta-pre-embed gate at the four meaningful states:
 *
 * 1. Zero-changes fast-path is unchanged — the existing `if (chunksToProcess.length === 0)`
 *    early-return at line 177 of VectorService.mjs is preserved by the gate.
 * 2. Below-threshold MCP invocation succeeds — agent-callable steady-state.
 * 3. Above-threshold MCP invocation refuses with `KB_SYNC_VOLUME_EXCEEDED` payload that
 *    the KB Server's `'error' in result` contract converts to `isError: true`.
 * 4. Above-threshold CLI invocation bypasses the gate — explicit opt-in to long-running work.
 *
 * Spy-collection pattern: replaces `KB_ChromaManager.getKnowledgeBaseCollection` with
 * an in-memory spy that simulates ChromaDB's `get` (existing IDs) + `upsert` (embedding
 * write) without touching the real DB. The spy lets us seed `existingIds` to engineer
 * specific `chunksToProcess` volumes for each branch.
 *
 * Serial mode: specs mutate the `KB_ChromaManager.getKnowledgeBaseCollection` singleton.
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection({existingIds = []} = {}) {
    const rows = new Map();
    existingIds.forEach(id => rows.set(id, {id, metadata: {}, document: ''}));

    const calls = {get: 0, upsert: 0, delete: 0, count: 0};

    return {
        rows,
        calls,
        name: 'spy-knowledge-base',

        async get({ids, where, limit = 2000, offset = 0, include = []} = {}) {
            calls.get++;
            const all = Array.from(rows.keys());
            const slice = all.slice(offset, offset + limit);
            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(() => ({})) : [],
                documents: include.includes('documents') ? slice.map(() => '') : []
            };
        },

        async upsert({ids, embeddings, metadatas}) {
            calls.upsert++;
            ids.forEach((id, i) => rows.set(id, {
                id,
                metadata: metadatas?.[i] ?? {},
                embedding: embeddings?.[i] ?? null
            }));
        },

        async delete({ids}) {
            calls.delete++;
            ids.forEach(id => rows.delete(id));
        },

        async count() {
            calls.count++;
            return rows.size;
        }
    };
}

/**
 * Writes a JSONL file with N synthetic chunks. Each chunk is `kind: 'method-context'` (skips
 * the `module-context` className-map enrichment loop in embed()) with a unique `hash`.
 */
function writeFixtureJsonl(filePath, chunkCount, hashPrefix = 'chunk-') {
    const lines = [];
    for (let i = 0; i < chunkCount; i++) {
        lines.push(JSON.stringify({
            hash       : `${hashPrefix}${i}`,
            type       : 'method',
            name       : `method${i}`,
            className  : '',
            description: `synthetic chunk ${i}`,
            content    : `body ${i}`
        }));
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

test.describe('VectorService.embed — work-volume branching (#10572)', () => {
    let SDK, KB_VectorService, KB_ChromaManager, KB_Config;
    let TextEmbeddingService_orig;
    let originalGetCollection;
    let originalThreshold;
    let tmpDir, fixturePath;

    let TextEmbeddingService;

    test.beforeAll(async () => {
        SDK              = await import('../../../../../../ai/services.mjs');
        KB_ChromaManager = SDK.KB_ChromaManager;
        KB_Config        = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        // VectorService is a helper not exposed via the SDK exports — import directly.
        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        KB_VectorService = VectorServiceModule.default;

        // Stub the embedding API: tests verify the BRANCH decision, not real embedding work.
        // Without a stub, large-volume tests would attempt actual API calls (or timeout).
        TextEmbeddingService_orig = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));

        originalGetCollection = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
        originalThreshold     = KB_Config.data.mcpSyncMaxChunks;

        tmpDir      = path.resolve(os.tmpdir(), `kb-work-volume-test-${process.pid}-${Date.now()}`);
        fs.mkdirSync(tmpDir, {recursive: true});
        fixturePath = path.join(tmpDir, 'fixture.jsonl');
    });

    test.afterAll(async () => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_Config.data.mcpSyncMaxChunks             = originalThreshold;
        TextEmbeddingService.embedTexts             = TextEmbeddingService_orig;
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    test.beforeEach(() => {
        KB_Config.data.mcpSyncMaxChunks = 5; // tight threshold for predictable branching
    });

    test('zero-changes fast-path is unchanged (existing chunks dedup to empty queue)', async () => {
        // Seed existing IDs that match the fixture exactly — chunksToProcess becomes empty.
        const ids = ['chunk-0', 'chunk-1', 'chunk-2'];
        const spy = createSpyCollection({existingIds: ids});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 3); // hashes match the seeded existingIds

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        expect(result.message).toContain('No changes detected');
        expect('error' in result).toBe(false);
        expect(spy.calls.upsert).toBe(0); // no embedding work attempted
    });

    test('below-threshold MCP invocation succeeds (synchronous embedding path)', async () => {
        // 3 new chunks, threshold 5 — small enough to run synchronously via MCP.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 3);

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        expect('error' in result).toBe(false);
        expect(result.message).toContain('Embedding complete');
        expect(spy.calls.upsert).toBeGreaterThan(0); // embedding actually happened
    });

    test('above-threshold MCP invocation returns KB_SYNC_VOLUME_EXCEEDED — adapter converts to isError', async () => {
        // 10 new chunks, threshold 5 — gate fires.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 10);

        const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

        // Service-level shape (the {error, code, ...} payload).
        expect(result.code).toBe('KB_SYNC_VOLUME_EXCEEDED');
        expect(result.chunksToProcess).toBe(10);
        expect(result.threshold).toBe(5);
        expect(result.message).toContain('npm run ai:sync-kb');
        expect(spy.calls.upsert).toBe(0); // no embedding work attempted under the gate

        // Tail-progress reference (#10576 RA1 from @neo-gpt cycle 2): rendered message
        // must point operators at a usable log path with no `undefined` interpolation.
        // Defensive fallback in VectorService kicks in when `aiConfig.logPath` is absent
        // — proven by the no-undefined assertion under the canonical-config setup, then
        // by the dedicated fallback test below that simulates a stale config.mjs.
        expect(result.message).toContain('tail -f');
        expect(result.message).toContain('kb-server-');
        expect(result.message).not.toContain('undefined');

        // Wire-format boundary (RA2 per @neo-gpt cycle 1): the KB Server's adapter at
        // Server.mjs:202 — `isError = 'error' in result` — is the contract that converts
        // this service-level shape into the MCP-protocol `isError: true` the caller observes.
        // Inline the same expression here so this test asserts the observable wire-format
        // result, not just the service return shape. (We don't dispatch through callTool
        // because SDK init runs makeSafe, which Zod-strips closure-injected `viaMcp: true`
        // before it reaches the gate — a test-env artifact, not a production path.)
        const isError = Neo.isObject(result) && 'error' in result;
        expect(isError).toBe(true);
    });

    test('above-threshold MCP gate-message renders fallback path when aiConfig.logPath unset (#10580 RA1)', async () => {
        // Simulates an existing gitignored `config.mjs` deployment without the new
        // `logPath` template key. Naked `${aiConfig.logPath}` interpolation would
        // render `undefined/kb-server-...`; the fallback in VectorService.embed should
        // render `${neoRootDir}/.neo-ai-data/logs/kb-server-...` instead.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;
        writeFixtureJsonl(fixturePath, 10);

        const wasLogPath       = KB_Config.data.logPath;
        KB_Config.data.logPath = undefined;

        try {
            const result = await KB_VectorService.embed(fixturePath, {viaMcp: true});

            expect(result.code).toBe('KB_SYNC_VOLUME_EXCEEDED');
            expect(result.message).not.toContain('undefined');
            expect(result.message).toContain('.neo-ai-data/logs');
        } finally {
            KB_Config.data.logPath = wasLogPath;
        }
    });

    test('above-threshold CLI invocation bypasses the gate (explicit opt-in to long work)', async () => {
        // Same volume as the above-threshold test, but viaMcp: false (or omitted).
        // CLI callers (npm run ai:sync-kb) opt into long-running work.
        const spy = createSpyCollection({existingIds: []});
        KB_ChromaManager.getKnowledgeBaseCollection = async () => spy;

        writeFixtureJsonl(fixturePath, 10);

        const result = await KB_VectorService.embed(fixturePath); // viaMcp omitted → false

        // Bypass succeeds: embedding completes; no error-shape returned.
        expect('error' in result).toBe(false);
        expect(result.message).toContain('Embedding complete');
        expect(spy.calls.upsert).toBeGreaterThan(0); // embedding actually happened
    });

});
