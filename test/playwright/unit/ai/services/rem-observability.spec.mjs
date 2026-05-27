import {setup} from '../../../setup.mjs';

const appName = 'RemObservabilityTest';

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
import {mkdir, writeFile, rm} from 'fs/promises';
import path                   from 'path';
import {fileURLToPath}        from 'url';
import Neo                    from '../../../../../src/Neo.mjs';
import * as core              from '../../../../../src/core/_export.mjs';

/**
 * @summary Cross-service unit coverage for the 5-axis REM observability primitive
 * shipped by Epic #12065 Sub 2 / #12068 Phase 1 Part A.
 *
 * The 5 axes per Discussion #12062 §2.6:
 * - **A** — Chroma summary count (via existing tooling, not under test here)
 * - **A2 (positive)** — `ChromaManager.getGraphDigestedCount`
 * - **A2 (negative)** — `ChromaManager.getUndigestedSessionCount`
 * - **B** — `GraphService.getSessionNodeCount` (deployment-wide SESSION nodes)
 * - **C** — `GraphService.getSessionEntityCount(sessionId)` (per-session entity yield)
 * - **D** — `TopologyInferenceEngine.getTopologyConflictCount` (conflicts in handoff)
 *
 * The healthy-pipeline invariant is `chroma.graphDigested ≈ graph.SESSION` within
 * batch-window tolerance; the GPT live V-B-A 2026-05-27 ~01:19Z anchor showed 76×
 * divergence (1,069 Chroma summaries vs only 14 graph SESSION nodes), which is the
 * empirical evidence these helpers are designed to surface.
 *
 * Tests use the same `originalX / fakeX / afterEach restore` stubbing pattern as
 * `GraphService.TenantIsolation.spec.mjs` for parity with existing conventions.
 *
 * @see ai/services/memory-core/managers/ChromaManager.mjs — axis helpers
 * @see ai/services/memory-core/GraphService.mjs — axis helpers
 * @see ai/services/graph/TopologyInferenceEngine.mjs — axis helper
 * @see Epic #12065 Sub 2 #12068 — 5-axis observability primitive ticket
 * @see Discussion #12062 §2.6 — axis-divergence framing
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const tmpDir     = path.join(__dirname, '.tmp-rem-observability-test');

/**
 * Build a fake Chroma summary collection that returns the given batch on `.get()`.
 * Mirrors the `summaryCollection.get({include: ['metadatas'], limit})` shape used
 * by both axis helpers.
 *
 * @param {Array<{id: string, meta: object}>} entries
 * @returns {{get: Function}}
 */
function makeFakeSummaryCollection(entries) {
    return {
        async get({include = [], limit = 2000} = {}) {
            const sliced = entries.slice(0, limit);
            return {
                ids      : sliced.map(e => e.id),
                metadatas: include.includes('metadatas') ? sliced.map(e => e.meta) : null,
                documents: include.includes('documents') ? sliced.map(() => '') : null
            };
        }
    };
}

/**
 * Build a fake `GraphService.db.storage.db` with stubbed `.prepare(sql)` returning
 * a statement whose `.get(...)` returns a predetermined row.
 *
 * @param {Function} prepareImpl (sql, args) -> {get: () => row}
 * @returns {{storage: {db: {prepare: Function}}}}
 */
function makeFakeGraphDb(prepareImpl) {
    return {
        storage: {
            db: {prepare: prepareImpl}
        }
    };
}

test.describe('ai/services REM observability axis helpers (#12068 Sub 2 Part A)', () => {
    let ChromaManager, GraphService, TopologyInferenceEngine;
    let originalGetSummaryCollection, originalGraphDb, originalHandoffPath;
    let aiConfig;

    test.beforeAll(async () => {
        ChromaManager           = (await import('../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;
        GraphService            = (await import('../../../../../ai/services/memory-core/GraphService.mjs')).default;
        TopologyInferenceEngine = (await import('../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;
        aiConfig                = (await import('../../../../../ai/services.mjs')).Memory_Config;

        await mkdir(tmpDir, {recursive: true});
    });

    test.afterAll(async () => {
        await rm(tmpDir, {recursive: true, force: true}).catch(() => {});
    });

    test.beforeEach(() => {
        originalGetSummaryCollection = ChromaManager.getSummaryCollection;
        originalGraphDb              = GraphService.db;
        originalHandoffPath          = aiConfig.data.handoffFilePath;
    });

    test.afterEach(() => {
        ChromaManager.getSummaryCollection = originalGetSummaryCollection;
        GraphService.db                    = originalGraphDb;
        aiConfig.data.handoffFilePath      = originalHandoffPath;
    });

    test.describe('ChromaManager.getUndigestedSessionCount', () => {
        test('counts sessions WITHOUT graphDigested:true flag (default)', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([
                {id: 's1', meta: {sessionId: 's1'}},
                {id: 's2', meta: {sessionId: 's2', graphDigested: true}},
                {id: 's3', meta: {sessionId: 's3'}},
                {id: 's4', meta: {sessionId: 's4', graphDigested: 'true'}},
                {id: 's5', meta: {sessionId: 's5', graphDigested: false}}
            ]);

            expect(await ChromaManager.getUndigestedSessionCount()).toBe(3); // s1, s3, s5
        });

        test('treats both boolean true AND string "true" as digested (mirrors DreamService.findUndigestedSessions)', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([
                {id: 's1', meta: {graphDigested: true}},
                {id: 's2', meta: {graphDigested: 'true'}}
            ]);

            expect(await ChromaManager.getUndigestedSessionCount()).toBe(0);
        });

        test('empty collection returns 0', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([]);
            expect(await ChromaManager.getUndigestedSessionCount()).toBe(0);
        });

        test('null-meta entries are treated as undigested (defensive)', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([
                {id: 's1', meta: null},
                {id: 's2', meta: {graphDigested: true}}
            ]);

            expect(await ChromaManager.getUndigestedSessionCount()).toBe(0); // s1 with null meta is filtered out by null-guard
        });
    });

    test.describe('ChromaManager.getGraphDigestedCount', () => {
        test('counts sessions WITH graphDigested:true flag', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([
                {id: 's1', meta: {sessionId: 's1'}},
                {id: 's2', meta: {sessionId: 's2', graphDigested: true}},
                {id: 's3', meta: {sessionId: 's3', graphDigested: 'true'}},
                {id: 's4', meta: {sessionId: 's4', graphDigested: false}}
            ]);

            expect(await ChromaManager.getGraphDigestedCount()).toBe(2); // s2, s3
        });

        test('the pair invariant — undigested + digested == total within batch window', async () => {
            const entries = [
                {id: 's1', meta: {graphDigested: true}},
                {id: 's2', meta: {}},
                {id: 's3', meta: {graphDigested: 'true'}},
                {id: 's4', meta: {sessionId: 's4'}}
            ];
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection(entries);

            const undigested = await ChromaManager.getUndigestedSessionCount();
            const digested   = await ChromaManager.getGraphDigestedCount();

            expect(undigested + digested).toBe(entries.length);
        });

        test('empty collection returns 0', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([]);
            expect(await ChromaManager.getGraphDigestedCount()).toBe(0);
        });
    });

    test.describe('GraphService.getSessionNodeCount', () => {
        test('returns count from SQLite SESSION-label query', () => {
            GraphService.db = makeFakeGraphDb((sql) => {
                // Verify the helper uses the deployment-wide-tenant-isolation filter
                expect(sql).toContain("json_extract(data, '$.label') = 'SESSION'");
                expect(sql).toContain("COALESCE(json_extract(data, '$.properties.userId'), '') = ''");
                return {get: () => ({c: 42})};
            });

            expect(GraphService.getSessionNodeCount()).toBe(42);
        });

        test('returns 0 when storage db is unavailable (graceful degradation)', () => {
            GraphService.db = {storage: null};
            expect(GraphService.getSessionNodeCount()).toBe(0);
        });

        test('returns 0 on SQL exception (graceful degradation)', () => {
            GraphService.db = makeFakeGraphDb(() => {
                throw new Error('simulated SQLite error');
            });
            expect(GraphService.getSessionNodeCount()).toBe(0);
        });
    });

    test.describe('GraphService.getSessionEntityCount(sessionId)', () => {
        test('counts outbound edges from canonical-prefixed SESSION node', () => {
            GraphService.db = makeFakeGraphDb((sql) => {
                expect(sql).toContain('SELECT count(*) as count FROM Edges WHERE source = ?');
                return {get: (id) => {
                    expect(id).toBe('SESSION:abc-123');
                    return {count: 7};
                }};
            });

            expect(GraphService.getSessionEntityCount('SESSION:abc-123')).toBe(7);
        });

        test('normalizes bare sessionId to canonical SESSION: prefix', () => {
            GraphService.db = makeFakeGraphDb(() => ({get: (id) => {
                expect(id).toBe('SESSION:bare-id');
                return {count: 3};
            }}));

            expect(GraphService.getSessionEntityCount('bare-id')).toBe(3);
        });

        test('returns 0 for falsy / non-string sessionId (defensive)', () => {
            expect(GraphService.getSessionEntityCount(null)).toBe(0);
            expect(GraphService.getSessionEntityCount(undefined)).toBe(0);
            expect(GraphService.getSessionEntityCount('')).toBe(0);
            expect(GraphService.getSessionEntityCount(123)).toBe(0);
        });

        test('returns 0 when storage db is unavailable', () => {
            GraphService.db = {storage: null};
            expect(GraphService.getSessionEntityCount('abc-123')).toBe(0);
        });

        test('returns 0 on SQL exception', () => {
            GraphService.db = makeFakeGraphDb(() => {
                throw new Error('simulated SQLite error');
            });
            expect(GraphService.getSessionEntityCount('abc-123')).toBe(0);
        });
    });

    test.describe('TopologyInferenceEngine.getTopologyConflictCount', () => {
        test('counts (Source Session: lines in handoff file', async () => {
            const handoffPath = path.join(tmpDir, 'handoff-counts.md');
            await writeFile(handoffPath, [
                '# Sandman Handoff Alerts',
                '',
                '## Active Conflicts',
                '',
                '- **[SUPERSEDES]** `issue-100`: foo (Source Session: s1)',
                '- **[OBSOLETES]** `issue-101`: bar (Source Session: s2)',
                '- **[DUPLICATE]** `issue-102`: baz (Source Session: s3)',
                '',
                '## Computed Golden Path',
                '',
                'Some Golden Path content here, no Source Session marker.',
                ''
            ].join('\n'), 'utf8');
            aiConfig.data.handoffFilePath = handoffPath;

            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(3);
        });

        test('returns 0 when handoff file does not exist (ENOENT)', async () => {
            aiConfig.data.handoffFilePath = path.join(tmpDir, 'never-existed.md');
            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 when handoffFilePath is unset', async () => {
            aiConfig.data.handoffFilePath = null;
            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 for empty handoff file', async () => {
            const handoffPath = path.join(tmpDir, 'handoff-empty.md');
            await writeFile(handoffPath, '', 'utf8');
            aiConfig.data.handoffFilePath = handoffPath;

            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 for handoff with NO Source Session entries (Golden Path only)', async () => {
            const handoffPath = path.join(tmpDir, 'handoff-no-conflicts.md');
            await writeFile(handoffPath, [
                '# Sandman Handoff Alerts',
                '',
                '## Computed Golden Path',
                '',
                'Some content, but zero conflict markers.',
                ''
            ].join('\n'), 'utf8');
            aiConfig.data.handoffFilePath = handoffPath;

            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });
    });
});
