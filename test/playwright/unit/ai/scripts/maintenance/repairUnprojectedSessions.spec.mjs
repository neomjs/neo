import {setup} from '../../../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    createRuntime,
    createSessionGraphId,
    findUnprojectedSessions,
    parseArgs,
    repairUnprojectedSessions,
    runCli
} from '../../../../../../ai/scripts/maintenance/repairUnprojectedSessions.mjs';

void Neo;
void core;

function createSummaryCollection(rows, calls = []) {
    return {
        async count() {
            return rows.length
        },
        async get({include, limit, offset = 0}) {
            calls.push({include, limit, offset});

            const page = rows.slice(offset, offset + limit);

            return {
                ids      : page.map(row => row.chromaId),
                metadatas: page.map(row => row.meta)
            }
        }
    }
}

function createGraphDb(existingIds = []) {
    const existing = new Set(existingIds);

    return {
        prepare() {
            return {
                get(id) {
                    return existing.has(id) ? {found: 1} : undefined
                }
            }
        }
    }
}

test.describe('ai/scripts/maintenance/repairUnprojectedSessions', () => {
    test('parses safe dry-run defaults and explicit apply flags', () => {
        expect(parseArgs([])).toEqual({
            apply       : false,
            batchSize   : 500,
            digestedOnly: true,
            help        : false,
            limit       : 50
        });

        expect(parseArgs(['--apply', '--limit', 'all', '--batch-size', '25', '--include-undigested'])).toEqual({
            apply       : true,
            batchSize   : 25,
            digestedOnly: false,
            help        : false,
            limit       : null
        });
    });

    test('createRuntime selects readonly dry-run runtime unless apply mode is requested', async () => {
        const
            calls      = [],
            dryRuntime = {mode: 'dry'},
            appRuntime = {mode: 'apply'},
            factories  = {
                async dryRunRuntimeFactory() {
                    calls.push('dry');
                    return dryRuntime
                },
                async applyRuntimeFactory() {
                    calls.push('apply');
                    return appRuntime
                }
            };

        await expect(createRuntime({}, factories)).resolves.toBe(dryRuntime);
        await expect(createRuntime({apply: false}, factories)).resolves.toBe(dryRuntime);
        await expect(createRuntime({apply: true}, factories)).resolves.toBe(appRuntime);
        expect(calls).toEqual(['dry', 'dry', 'apply']);
    });

    test('runCli passes parsed dry-run options to the runtime factory and cleans up runtime handles', async () => {
        const
            rows = [
                {chromaId: 'summary-a', meta: {sessionId: 'a', graphDigested: true}}
            ],
            stdout = [],
            stderr = [],
            cleanupCalls = [],
            optionsSeen  = [];

        const exitCode = await runCli(['--dry-run', '--limit', 'all'], {
            stdout: line => stdout.push(line),
            stderr: line => stderr.push(line),
            async runtimeFactory(options) {
                optionsSeen.push(options);

                return {
                    summaryCollection: createSummaryCollection(rows),
                    graphDb          : createGraphDb(),
                    cleanup() {
                        cleanupCalls.push('cleanup');
                    }
                }
            }
        });

        expect(exitCode).toBe(0);
        expect(stderr).toEqual([]);
        expect(optionsSeen).toEqual([{
            apply       : false,
            batchSize   : 500,
            digestedOnly: true,
            help        : false,
            limit       : null
        }]);
        expect(cleanupCalls).toEqual(['cleanup']);

        const payload = JSON.parse(stdout[0]);
        expect(payload.mode).toBe('dry-run');
        expect(payload.candidates).toBe(1);
        expect(payload.results).toEqual([
            {chromaId: 'summary-a', sessionId: 'a', graphNodeId: 'session:a'}
        ]);
    });

    test('findUnprojectedSessions selects graphDigested rows with missing SESSION graph nodes', async () => {
        const calls = [];
        const rows  = [
            {chromaId: 'summary-a', meta: {sessionId: 'a', graphDigested: true}},
            {chromaId: 'summary-b', meta: {sessionId: 'b', graphDigested: 'true'}},
            {chromaId: 'summary-c', meta: {sessionId: 'c'}},
            {chromaId: 'summary-d', meta: {sessionId: 'd', graphDigested: true}},
            {chromaId: 'summary-missing-session', meta: {graphDigested: true}}
        ];

        const result = await findUnprojectedSessions({
            summaryCollection: createSummaryCollection(rows, calls),
            graphDb          : createGraphDb(['session:b']),
            batchSize        : 2,
            limit            : 10
        });

        expect(calls).toEqual([
            {include: ['metadatas'], limit: 2, offset: 0},
            {include: ['metadatas'], limit: 2, offset: 2},
            {include: ['metadatas'], limit: 1, offset: 4}
        ]);
        expect(result.candidates).toEqual([
            {chromaId: 'summary-a', sessionId: 'a', graphNodeId: 'session:a'},
            {chromaId: 'summary-d', sessionId: 'd', graphNodeId: 'session:d'}
        ]);
        expect(result.stats).toEqual({
            total              : 5,
            scanned            : 5,
            skippedNoSessionId : 1,
            skippedNotDigested : 1,
            skippedAlreadyGraph: 1
        });
    });

    test('repairUnprojectedSessions dry-runs candidates and apply mode backfills through MemorySessionIngestor', async () => {
        const rows = [
            {chromaId: 'summary-a', meta: {sessionId: 'a', graphDigested: true}},
            {chromaId: 'summary-b', meta: {sessionId: 'b', graphDigested: true}}
        ];
        const summaryCollection = createSummaryCollection(rows);
        const graphDb           = createGraphDb();
        const calls             = [];

        const dryRun = await repairUnprojectedSessions({
            summaryCollection,
            graphDb,
            apply: false
        });

        expect(dryRun.mode).toBe('dry-run');
        expect(dryRun.candidates).toBe(2);
        expect(dryRun.repaired).toBe(0);
        expect(dryRun.results.map(row => row.graphNodeId)).toEqual(['session:a', 'session:b']);

        const apply = await repairUnprojectedSessions({
            summaryCollection,
            graphDb,
            apply                : true,
            memorySessionIngestor: {
                async ingestSingleRow(graphNodeId, options) {
                    calls.push({graphNodeId, sameCollection: options.summaryCollection === summaryCollection});
                    return {success: true, reason: graphNodeId.endsWith(':a') ? 'backfilled' : 'already-exists'}
                }
            }
        });

        expect(apply.mode).toBe('apply');
        expect(apply.candidates).toBe(2);
        expect(apply.repaired).toBe(2);
        expect(apply.failed).toBe(0);
        expect(calls).toEqual([
            {graphNodeId: 'session:a', sameCollection: true},
            {graphNodeId: 'session:b', sameCollection: true}
        ]);
    });

    test('createSessionGraphId normalizes existing prefixes', () => {
        expect(createSessionGraphId('abc')).toBe('session:abc');
        expect(createSessionGraphId('SESSION:abc')).toBe('session:abc');
        expect(createSessionGraphId('session:abc')).toBe('session:abc');
        expect(createSessionGraphId(null)).toBeNull();
    });
});
