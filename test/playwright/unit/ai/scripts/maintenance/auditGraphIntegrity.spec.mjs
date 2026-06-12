import {setup} from '../../../../setup.mjs';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

const appName = 'AuditGraphIntegrityTest';

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
import fsExtra        from 'fs-extra';
import os             from 'os';
import path           from 'path';

test.describe('auditGraphIntegrity.mjs (#10462)', () => {
    let mod;
    let workRoot;

    test.beforeAll(async () => {
        mod      = await import('../../../../../../ai/scripts/maintenance/auditGraphIntegrity.mjs');
        workRoot = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'audit-graph-integrity-'));
    });

    test.afterAll(async () => {
        if (workRoot) await fsExtra.remove(workRoot);
    });

    test('parseArgs supports env defaults and CLI overrides', () => {
        const args = mod.parseArgs([
            '--output-dir=/tmp/audits',
            '--page-size', '25',
            '--hard-threshold', '0.10'
        ], {
            GRAPH_INTEGRITY_AUDIT_DIR     : '/env/audits',
            GRAPH_INTEGRITY_PAGE_SIZE     : '50',
            GRAPH_INTEGRITY_HARD_THRESHOLD: '0.07'
        });

        expect(args).toEqual({
            outputDir    : '/tmp/audits',
            pageSize     : 25,
            hardThreshold: 0.10
        });
    });

    test('collectMemorySessionCounts groups raw memories by sessionId across pages', async () => {
        const collection = fakeCollection([
            {id: 'm1', metadata: {sessionId: 'session-a', userId: 'neo-gpt'}},
            {id: 'm2', metadata: {sessionId: 'session-a', userId: 'neo-gpt'}},
            {id: 'm3', metadata: {sessionId: 'session-b', userId: 'neo-opus-4-7'}},
            {id: 'm4', metadata: {missing: 'sessionId'}},
            {id: 'm5', metadata: {sessionId: 'session-b', userId: 'neo-opus-4-7'}}
        ]);

        const counts = await mod.collectMemorySessionCounts(collection, {pageSize: 2});

        expect([...counts.keys()].sort()).toEqual(['session-a', 'session-b']);
        expect(counts.get('session-a').expectedMemoryCount).toBe(2);
        expect(counts.get('session-b').expectedMemoryCount).toBe(2);
        expect(collection.calls.map(call => call.offset)).toEqual([0, 2, 4]);
    });

    test('createGraphIntegrityReport classifies clean, soft, and hard sessions and returns worst exit code', () => {
        const memorySessionCounts = new Map([
            ['clean-session', {sessionId: 'clean-session', expectedMemoryCount: 10, userId: 'shared'}],
            ['soft-session',  {sessionId: 'soft-session',  expectedMemoryCount: 100, userId: 'shared'}],
            ['hard-session',  {sessionId: 'hard-session',  expectedMemoryCount: 100, userId: 'shared'}]
        ]);
        const summarySessions = new Map([
            ['clean-session', {sessionId: 'clean-session', chromaSessionId: 'summary-clean'}],
            ['soft-session',  {sessionId: 'soft-session',  chromaSessionId: 'summary-soft'}],
            ['hard-session',  {sessionId: 'hard-session',  chromaSessionId: 'summary-hard'}]
        ]);
        const graphSessions = new Map([
            ['clean-session', {sessionId: 'clean-session', sessionNodeId: 'session:clean-session'}],
            ['soft-session',  {sessionId: 'soft-session',  sessionNodeId: 'session:soft-session'}],
            ['hard-session',  {sessionId: 'hard-session',  sessionNodeId: 'session:hard-session'}]
        ]);
        const actualCounts = new Map([
            ['clean-session', 10],
            ['soft-session',  97],
            ['hard-session',  80]
        ]);

        const report = mod.createGraphIntegrityReport({
            memorySessionCounts,
            summarySessions,
            graphSessions,
            generatedAt         : '2026-05-28T04:00:00.000Z',
            hardThreshold       : 0.05,
            getActualMemoryCount: sessionId => actualCounts.get(sessionId)
        });

        expect(report.summary).toMatchObject({
            totalSessions: 3,
            clean        : 1,
            soft         : 1,
            hard         : 1,
            worstSeverity: 'hard',
            exitCode     : 2
        });

        const soft = report.entries.find(entry => entry.sessionId === 'soft-session');
        expect(soft).toMatchObject({
            sessionNodeId      : 'session:soft-session',
            chromaSessionId    : 'summary-soft',
            expectedMemoryCount: 100,
            actualMemoryCount  : 97,
            divergence         : 3,
            severity           : 'soft'
        });
        expect(soft.divergenceRatio).toBeCloseTo(0.03, 5);
    });

    test('countGraphOriginatesInEdges filters by target session and ORIGINATES_IN edge type', () => {
        const graphService = {
            normalizeGraphNodeId: id => id.toLowerCase(),
            db: {
                storage: {
                    db: {
                        prepare: sql => {
                            expect(sql).toContain('FROM Edges');
                            expect(sql).toContain("type = 'ORIGINATES_IN'");

                            return {
                                get: targetId => {
                                    expect(targetId).toBe('session:abc-123');
                                    return {count: 4};
                                }
                            };
                        }
                    }
                }
            }
        };

        expect(mod.countGraphOriginatesInEdges(graphService, 'SESSION:ABC-123')).toBe(4);
    });

    test('writeReport emits timestamped JSON under the audit directory', async () => {
        const report = {
            generatedAt: '2026-05-28T04:01:02.003Z',
            summary    : {exitCode: 0},
            entries    : [],
            exitCode   : 0
        };

        const reportPath = await mod.writeReport(report, {outputDir: workRoot});

        expect(path.basename(reportPath)).toBe('graph-integrity-2026-05-28T04-01-02.003Z.json');
        expect(await fsExtra.readJson(reportPath)).toEqual(report);
    });
});

function fakeCollection(rows) {
    const calls = [];

    return {
        calls,
        get: async ({limit, offset = 0}) => {
            calls.push({limit, offset});
            const sliced = rows.slice(offset, offset + limit);
            return {
                ids      : sliced.map(row => row.id),
                metadatas: sliced.map(row => row.metadata)
            };
        }
    };
}
