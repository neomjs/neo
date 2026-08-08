import {setup} from '../../../../../setup.mjs';

const appName = 'KBManageKnowledgeBaseWipeRefusalTest';

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

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';

/**
 * The guarantee agents depend on is *"`manage_knowledge_base` cannot wipe the corpus"*, and it was
 * proven two layers below the surface an agent touches — at `VectorService`, reached via
 * `DatabaseService.embedKnowledgeBase`. The work-volume gate protects the outcome, but nothing
 * pinned the contract at the boundary, so a future refactor could thread `viaMcp` differently or add
 * a caller that bypasses `embedKnowledgeBase` with every existing spec still green.
 *
 * ## Why the positive claim sits at `callTool` and the negative control does not
 *
 * The upstream ticket framed this as a choice between the cheap boundary (`DatabaseService`, no
 * Proxy) and the real one (full `callTool`), with the real one gated on first proving `viaMcp`
 * survives `makeSafe`. Measured at `dev`, that prerequisite does not exist on this path:
 *
 * - `ai/mcp/server/knowledge-base/toolService.mjs` imports `DatabaseService` **directly from the
 *   service file**, not from the `services.mjs` barrel — so no `makeSafe` Proxy sits between them.
 * - `ai/mcp/ToolService.mjs` validates the CALLER's arguments and only then invokes the handler,
 *   which adds `viaMcp: true` **after** validation.
 *
 * So the real surface was free, and the positive claim is asserted there.
 *
 * The negative control cannot follow it. `manage_knowledge_base`'s request schema declares only
 * `action` and `confirmation`; `staleStrategy` is undeclared, and input schemas are strict, so
 * `callTool` strips it. An agent therefore cannot express an explicit destructive strategy at all —
 * which is a stronger statement than the ticket's "optional at every hop", and it is why the control
 * that proves deletion is *reachable* has to sit one layer down. The last test pins that strip, so a
 * reader can see the split is measured rather than chosen for convenience.
 *
 * ## What these assert, and what they refuse to assert
 *
 * Every corpus claim is made by **counting surviving rows**, never by matching a refusal payload. A
 * spec that asserts `code === 'KB_SYNC_VOLUME_EXCEEDED'` proves a message was produced; only the row
 * count proves nothing was deleted. The negative control exists so a green run cannot be explained
 * by the deletion path being unreachable in the fixture.
 *
 * Serial mode: these mutate the `ChromaManager.getKnowledgeBaseCollection` singleton and shared
 * config leaves, and restore both.
 */
test.describe.configure({mode: 'serial'});

/**
 * @summary In-memory stand-in for a Chroma collection that records deletions and retains rows.
 *
 * `rows` is the corpus under test: its size after a call is the assertion that matters, because a
 * refusal payload and a completed wipe are indistinguishable from the return value alone.
 * @param {Object}   [options]
 * @param {String[]} [options.existingIds=[]] Ids seeded as already-embedded corpus rows.
 * @returns {Object} Collection spy exposing `rows`, `calls`, and the Chroma surface used by embed.
 */
function createSpyCollection({existingIds = []} = {}) {
    const
        rows  = new Map(),
        calls = {get: 0, upsert: 0, delete: 0};

    existingIds.forEach(id => rows.set(id, {id, metadata: {}, document: ''}));

    return {
        rows,
        calls,
        name: 'spy-knowledge-base',

        async get({limit = 2000, offset = 0, include = []} = {}) {
            calls.get++;
            const slice = Array.from(rows.keys()).slice(offset, offset + limit);

            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(id => rows.get(id).metadata) : [],
                documents: include.includes('documents') ? slice.map(() => '') : []
            }
        },

        async upsert({ids, embeddings, metadatas}) {
            calls.upsert++;
            ids.forEach((id, i) => rows.set(id, {id, metadata: metadatas?.[i] ?? {}, embedding: embeddings?.[i] ?? null}))
        },

        async delete({ids}) {
            calls.delete++;
            ids.forEach(id => rows.delete(id))
        },

        async count() { return rows.size }
    }
}

test.describe('manage_knowledge_base cannot wipe the corpus, asserted at the surface agents call (#16591)', () => {
    let callTool, DatabaseService, ChromaManager, KB_Config, TextEmbeddingService, VectorService;
    let originalGetCollection, originalThreshold, originalDataPath, originalEmbedTexts;
    let tmpDir, fixturePath;

    /**
     * @summary Writes a JSONL corpus whose chunk hashes are deliberately disjoint from the seeded
     * collection ids, so every existing row classifies as stale and becomes a deletion candidate.
     * @param {Number} count Number of chunks to emit.
     */
    function writeFixtureJsonl(count) {
        const lines = Array.from({length: count}, (_, i) => JSON.stringify({
            content: `fixture chunk ${i}`,
            hash   : `fixture-hash-${i}`,
            name   : `fixture${i}`,
            type   : 'method'
        }));

        fs.writeFileSync(fixturePath, lines.join('\n') + (lines.length ? '\n' : ''))
    }

    test.beforeAll(async () => {
        // Same barrel + `.data` mutation surface the sibling `VectorService.WorkVolumeBranching`
        // spec uses. `KB_Config` here is `ai/mcp/server/knowledge-base/config.mjs` — the exact module
        // `DatabaseService` imports as `aiConfig`, so `dataPath` set here is the one `embedKnowledgeBase`
        // reads. Leaf assignment on the config root is refused by the reactive provider
        // (ticket-ref-ok: ADR 0019 is the MECHANISM that refuses the write, not a tracking ref — the
        // reason `.data` is used here stops being derivable if the pointer is dropped);
        // `.data` is the sanctioned test surface, and every value is restored in afterAll.
        const SDK = await import('../../../../../../../ai/services.mjs');

        ({callTool}          = await import('../../../../../../../ai/mcp/server/knowledge-base/toolService.mjs'));
        DatabaseService      = (await import('../../../../../../../ai/services/knowledge-base/DatabaseService.mjs')).default;
        VectorService        = (await import('../../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
        ChromaManager        = SDK.KB_ChromaManager;
        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        originalGetCollection = ChromaManager.getKnowledgeBaseCollection.bind(ChromaManager);
        originalThreshold     = KB_Config.data.mcpSyncMaxChunks;
        originalDataPath      = KB_Config.data.dataPath;
        originalEmbedTexts    = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);

        // The branch under test is the gate decision, never real embedding work.
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));

        tmpDir      = path.resolve(os.tmpdir(), `kb-wipe-refusal-${process.pid}-${Date.now()}`);
        fixturePath = path.join(tmpDir, 'ai-knowledge-base.jsonl');
        fs.mkdirSync(tmpDir, {recursive: true})
    });

    test.afterAll(() => {
        ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_Config.data.mcpSyncMaxChunks          = originalThreshold;
        KB_Config.data.dataPath                  = originalDataPath;
        TextEmbeddingService.embedTexts          = originalEmbedTexts;

        tmpDir && fs.existsSync(tmpDir) && fs.rmSync(tmpDir, {force: true, recursive: true})
    });

    test.beforeEach(() => {
        KB_Config.data.mcpSyncMaxChunks = 5;
        KB_Config.data.dataPath         = fixturePath
    });

    test('a default-strategy embed call leaves every corpus row in place', async () => {
        // 20 seeded rows, none present in the fixture, so all 20 are deletion candidates against a
        // threshold of 5. This is the shape the ticket's hazard describes: an agent call that would
        // otherwise remove rows unmetered.
        const spy = createSpyCollection({existingIds: Array.from({length: 20}, (_, i) => `stale-${i}`)});

        ChromaManager.getKnowledgeBaseCollection = async () => spy;
        writeFixtureJsonl(0);

        await callTool('manage_knowledge_base', {action: 'embed'});

        // The corpus itself is the assertion. A refusal payload proves a message was produced; only
        // the surviving row count proves nothing was removed.
        expect(spy.rows.size, 'every seeded row must survive a default-strategy MCP embed').toBe(20);
        expect(spy.calls.delete, 'no deletion may be issued at all').toBe(0)
    });

    test('a default-strategy sync call leaves every corpus row in place', async () => {
        const
            spy            = createSpyCollection({existingIds: Array.from({length: 20}, (_, i) => `stale-${i}`)}),
            originalCreate = DatabaseService.createKnowledgeBase.bind(DatabaseService);

        // `sync` is create-then-embed; the create half regenerates the JSONL from repository source
        // and is not what this guards. Stubbed so the embed half runs against the same fixture.
        DatabaseService.createKnowledgeBase = async () => ({message: 'stubbed create'});
        ChromaManager.getKnowledgeBaseCollection = async () => spy;
        writeFixtureJsonl(0);

        try {
            await callTool('manage_knowledge_base', {action: 'sync'});

            expect(spy.rows.size, 'sync must not delete rows either').toBe(20);
            expect(spy.calls.delete).toBe(0)
        } finally {
            DatabaseService.createKnowledgeBase = originalCreate
        }
    });

    // PRIMARY NEGATIVE CONTROL, and it lives at the SAME surface as the claim it protects.
    //
    // Without it, the two tests above pass equally well against a fixture in which deletion was never
    // reachable — the exact failure the ticket names. Holding the surface, the strategy and the corpus
    // fixed and varying ONLY the threshold isolates the gate as the cause: below it, the identical
    // agent-issued call with the identical default strategy deletes every stale row.
    //
    // It also settles a question the ticket left open by measurement rather than argument: the default
    // strategy IS destructive. An agent cannot opt out (the strategy is stripped — see the last test)
    // and cannot opt in; the only thing standing between `manage_knowledge_base` and a wiped corpus is
    // the volume gate.
    test('below the threshold the SAME default-strategy call deletes — so the guard above is what stops it', async () => {
        const spy = createSpyCollection({existingIds: ['stale-a', 'stale-b', 'stale-c']});

        ChromaManager.getKnowledgeBaseCollection = async () => spy;
        writeFixtureJsonl(0);

        // Threshold 5, three stale rows: identical call to the first test, one variable changed.
        await callTool('manage_knowledge_base', {action: 'embed'});

        expect(spy.calls.delete, 'the deletion path must be live at the tool surface').toBeGreaterThan(0);
        expect(spy.rows.size, 'below-threshold stale rows are removed by the default strategy').toBe(0)
    });

    // SECONDARY control, one layer down. `staleStrategy` is stripped at `callTool`, so the claim
    // "an EXPLICIT destructive strategy is honored" cannot be expressed at the tool surface at all
    // and is asserted where the parameter survives.
    test('an explicit destructive strategy is honored one layer down, where the parameter survives', async () => {
        const spy = createSpyCollection({existingIds: ['stale-a', 'stale-b', 'stale-c']});

        ChromaManager.getKnowledgeBaseCollection = async () => spy;
        writeFixtureJsonl(0);

        // `delete-upfront`, not an invented `delete`: the strategy vocabulary is validated
        // (`Expected one of: delete-upfront, shadow-swap`), and a control that throws on an unknown
        // strategy would be green-by-rejection rather than green-by-deletion.
        await DatabaseService.manageKnowledgeBase({action: 'embed', staleStrategy: 'delete-upfront', viaMcp: true});

        expect(spy.calls.delete, 'the deletion path must be live, or the guards above prove nothing').toBeGreaterThan(0);
        expect(spy.rows.size, 'the below-threshold call is expected to remove the stale rows').toBe(0)
    });

    test('the tool boundary strips staleStrategy, which is why the control above sits one layer down', async () => {
        // Not incidental: an agent cannot express ANY stale strategy through `manage_knowledge_base`,
        // so the destructive default is the only behaviour reachable from the tool surface. That is a
        // stronger claim than "optional at every hop" and it belongs in the record.
        const
            {buildZodSchema} = await import('../../../../../../../ai/mcp/validation/openApiValidator.mjs'),
            yamlModule       = await import('js-yaml'),
            load             = yamlModule.load || yamlModule.default.load,
            __dirname        = path.dirname(fileURLToPath(import.meta.url)),
            repoRoot         = path.resolve(__dirname, '../../../../../../..'),
            spec             = load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8'));

        let operation;

        for (const item of Object.values(spec.paths || {})) {
            for (const method of Object.values(item)) {
                if (method?.operationId === 'manage_knowledge_base') operation = method
            }
        }

        expect(operation, 'manage_knowledge_base must exist in the KB OpenAPI contract').toBeTruthy();

        const parsed = buildZodSchema(spec, operation).parse({action: 'embed', staleStrategy: 'delete', viaMcp: true});

        expect(parsed).toEqual({action: 'embed'});
        expect('staleStrategy' in parsed, 'an agent cannot pass a stale strategy through the tool').toBe(false);
        expect('viaMcp' in parsed, 'viaMcp is injected by the handler AFTER validation, never by the caller').toBe(false)
    })
});
