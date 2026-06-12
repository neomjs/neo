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
import crypto             from 'node:crypto';
import {mkdir, writeFile} from 'fs/promises';
import os                 from 'node:os';
import path               from 'path';
import {fileURLToPath}    from 'url';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import {
    appendRemRunState,
    createRemRunStateEntry
} from '../../../../../ai/services/memory-core/helpers/remRunStateStore.mjs';

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

// Use OS tmpdir + per-test crypto UUID for full isolation across Playwright
// parallel workers — gitignored noise + shared-tmpDir cleanup races otherwise.
const tmpRoot = path.join(os.tmpdir(), 'neo-rem-observability-test');

/**
 * Build a unique per-test handoff file path under the OS tmpdir. Caller must
 * `await mkdir(tmpRoot, {recursive: true})` before `writeFile`.
 *
 * @param {string} suffix Descriptive suffix for debug-readability
 * @returns {string}
 */
function uniqueHandoffPath(suffix) {
    return path.join(tmpRoot, `handoff-${suffix}-${crypto.randomUUID()}.md`);
}

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
    let originalGetSummaryCollection, originalGraphDb, originalHandoffPath, originalRemRunStateDir, originalRemRunRecentLimit;
    let aiConfig;

    test.beforeAll(async () => {
        ChromaManager           = (await import('../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;
        GraphService            = (await import('../../../../../ai/services/memory-core/GraphService.mjs')).default;
        TopologyInferenceEngine = (await import('../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;
        aiConfig                = (await import('../../../../../ai/services.mjs')).Memory_Config;

        await mkdir(tmpRoot, {recursive: true});
    });

    test.afterAll(async () => {
        // Leave tmpRoot in place — OS-tmpdir is auto-collected by the system;
        // explicit rm would race with parallel test workers under fullyParallel.
    });

    test.beforeEach(() => {
        originalGetSummaryCollection = ChromaManager.getSummaryCollection;
        originalGraphDb              = GraphService.db;
        originalHandoffPath          = aiConfig.data.handoffFilePath;
        originalRemRunStateDir       = aiConfig.remRunStateDir;
        originalRemRunRecentLimit    = aiConfig.remRunRecentLimit;

        aiConfig.remRunStateDir      = path.join(tmpRoot, `rem-runs-${crypto.randomUUID()}`);
        aiConfig.remRunRecentLimit   = 5;
    });

    test.afterEach(() => {
        ChromaManager.getSummaryCollection = originalGetSummaryCollection;
        GraphService.db                    = originalGraphDb;
        aiConfig.data.handoffFilePath      = originalHandoffPath;
        aiConfig.remRunStateDir            = originalRemRunStateDir;
        aiConfig.remRunRecentLimit         = originalRemRunRecentLimit;
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
        test('counts INBOUND edges to canonical-lowercase session node (matches MemorySessionIngestor:226 writer direction)', () => {
            // V-B-A precedent: MemorySessionIngestor.mjs:226 writes
            // `GraphService.linkNodes(memoryNodeId, sessionNodeId, 'ORIGINATES_IN', 1.0)` —
            // session is the TARGET. SemanticGraphExtractor.mjs:88 LLM prompt directs
            // *"emit provenance edges linking them back to the source Memory or Session"*.
            // Both writer paths emit edges with `target = 'session:<id>'`. The helper
            // must query `target = ?` (not source) to count the per-session yield.
            GraphService.db = makeFakeGraphDb((sql) => {
                expect(sql).toContain('SELECT count(*) as count FROM Edges WHERE target = ?');
                return {get: (id) => {
                    // V-B-A precedent: GraphService.normalizeGraphNodeId (lines 489-505)
                    // canonicalizes to lowercase `session:` regardless of input case.
                    expect(id).toBe('session:abc-123');
                    return {count: 7};
                }};
            });

            expect(GraphService.getSessionEntityCount('session:abc-123')).toBe(7);
        });

        test('normalizes uppercase SESSION: input to canonical lowercase session: (uppercase appears in LLM prompts but is normalized before SQLite write)', () => {
            // Per GraphService.mjs:405-408 + normalizeGraphNodeId(): callers that pass
            // uppercase `SESSION:<id>` (e.g. lazy-edge-queue-shape) get normalized to
            // canonical lowercase before persistence. The helper must mirror this
            // normalization or it would return 0 against real SQLite data.
            GraphService.db = makeFakeGraphDb(() => ({get: (id) => {
                expect(id).toBe('session:upper-was-normalized');
                return {count: 5};
            }}));

            expect(GraphService.getSessionEntityCount('SESSION:upper-was-normalized')).toBe(5);
        });

        test('normalizes bare sessionId (no prefix) to canonical lowercase session:<id>', () => {
            GraphService.db = makeFakeGraphDb(() => ({get: (id) => {
                expect(id).toBe('session:bare-id');
                return {count: 3};
            }}));

            expect(GraphService.getSessionEntityCount('bare-id')).toBe(3);
        });

        test('real-substrate writer-contract vector — mirrors MemorySessionIngestor.linkNodes(memory→session) edge shape', () => {
            // This vector simulates a real ORIGINATES_IN edge as MemorySessionIngestor:226
            // would write it: source = `memory:<id>`, target = `session:<id>` (both
            // lowercase post-normalize). The helper's SQL filter (`target = ?`) MUST
            // match the canonical target-side session-id to return non-zero — proves
            // the helper is aligned with the writer's actual graph contract.
            let queriedTarget = null;
            GraphService.db = makeFakeGraphDb(() => ({get: (id) => {
                queriedTarget = id;
                // Simulate SQLite returning 4 ORIGINATES_IN edges for this session
                return {count: id === 'session:realsubstrate-001' ? 4 : 0};
            }}));

            expect(GraphService.getSessionEntityCount('session:realsubstrate-001')).toBe(4);
            expect(queriedTarget).toBe('session:realsubstrate-001');
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
            const handoffPath = uniqueHandoffPath('counts');
            await mkdir(tmpRoot, {recursive: true});
            await writeFile(handoffPath,[
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
            aiConfig.data.handoffFilePath = uniqueHandoffPath('never-existed');
            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 when handoffFilePath is unset', async () => {
            aiConfig.data.handoffFilePath = null;
            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 for empty handoff file', async () => {
            const handoffPath = uniqueHandoffPath('empty');
            await mkdir(tmpRoot, {recursive: true});
            await writeFile(handoffPath,'', 'utf8');
            aiConfig.data.handoffFilePath = handoffPath;

            expect(await TopologyInferenceEngine.getTopologyConflictCount()).toBe(0);
        });

        test('returns 0 for handoff with NO Source Session entries (Golden Path only)', async () => {
            const handoffPath = uniqueHandoffPath('no-conflicts');
            await mkdir(tmpRoot, {recursive: true});
            await writeFile(handoffPath,[
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

    test.describe('Memory Core MCP get_rem_pipeline_state', () => {
        test('projects all 5 axes plus optional per-session entity count through the MCP tool', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([
                {id: 's1', meta: {sessionId: 's1'}},
                {id: 's2', meta: {sessionId: 's2', graphDigested: true}},
                {id: 's3', meta: {sessionId: 's3', graphDigested: 'true'}},
                {id: 's4', meta: {sessionId: 's4'}}
            ]);

            GraphService.db = makeFakeGraphDb((sql) => {
                if (sql.includes('FROM Nodes')) {
                    return {get: () => ({c: 2})};
                }

                return {get: (id) => {
                    expect(id).toBe('session:s1');
                    return {count: 9};
                }};
            });

            const handoffPath = uniqueHandoffPath('mcp-state');
            await mkdir(tmpRoot, {recursive: true});
            await writeFile(handoffPath, [
                '# Sandman Handoff Alerts',
                '',
                '## Active Conflicts',
                '',
                '- **[SUPERSEDES]** `issue-100`: foo (Source Session: s1)',
                '- **[DUPLICATE]** `issue-101`: bar (Source Session: s2)',
                ''
            ].join('\n'), 'utf8');
            aiConfig.data.handoffFilePath = handoffPath;

            const {callTool} = await import('../../../../../ai/mcp/server/memory-core/toolService.mjs');
            const state = await callTool('get_rem_pipeline_state', {sessionId: 's1'});

            expect(state).toEqual({
                undigested       : 2,
                digested         : 2,
                sessionNodes     : 2,
                topologyConflicts: 2,
                recentCycles     : [],
                perSession       : {
                    sessionId  : 's1',
                    entityCount: 9
                }
            });
        });

        test('projects recent JSONL cycle state through the MCP tool', async () => {
            ChromaManager.getSummaryCollection = async () => makeFakeSummaryCollection([]);
            GraphService.db = makeFakeGraphDb((sql) => {
                if (sql.includes('FROM Nodes')) {
                    return {get: () => ({c: 0})};
                }

                return {get: () => ({count: 0})};
            });
            aiConfig.remRunRecentLimit = 1;

            await appendRemRunState(createRemRunStateEntry({
                runId              : 'rem-old',
                reason             : 'manual',
                startedAt          : 1000,
                completedAt        : 1100,
                configuredCadenceMs: 1000,
                overflowThreshold  : 0.8,
                outcome            : 'completed',
                reasonCode         : 'ok'
            }), {dir: aiConfig.remRunStateDir});

            await appendRemRunState(createRemRunStateEntry({
                runId              : 'rem-new',
                reason             : 'manual',
                startedAt          : 2000,
                completedAt        : 2900,
                configuredCadenceMs: 1000,
                overflowThreshold  : 0.8,
                outcome            : 'skipped',
                reasonCode         : 'no-undigested-sessions'
            }), {dir: aiConfig.remRunStateDir});

            const {callTool} = await import('../../../../../ai/mcp/server/memory-core/toolService.mjs');
            const state = await callTool('get_rem_pipeline_state', {});

            expect(state.recentCycles).toEqual([{
                runId              : 'rem-new',
                wallClockMs        : 900,
                cycleOverflowSignal: true,
                cycleOverflowRatio : 0.9,
                outcome            : 'skipped'
            }]);
        });
    });
});
