import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AiCompactGraphLogTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {spawnSync}    from 'node:child_process';
import Database       from 'better-sqlite3';
import fs             from 'fs-extra';
import path           from 'path';

import {
    compactGraphLogRows,
    computeCompactionPlan,
    createCommand,
    getDefaultGraphLogCompactionOptions,
    getGraphLogStats,
    listActiveWakeSubscriptions,
    parseConsumerWatermark,
    readWakeDaemonWatermark,
    readWakeSubscriptionWatermark,
    runGraphLogCompaction
} from '../../../../../../ai/scripts/maintenance/compactGraphLog.mjs';

/**
 * @summary Regression guard for GraphLog CDC compaction safety.
 *
 * The maintenance script may only delete rows at or below the minimum known live-consumer
 * watermark, must block on unknown active consumers, and is dry-run by default.
 */
test.describe('compactGraphLog maintenance guard', () => {
    let tmpRoot, dbPath, bridgeStateFile, wakeStateFile, db;

    async function withMemoryCoreConfigTemplate(callback) {
        const originalTier1Config         = Neo.ai?.Config;
        const originalTier1ClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];
        const originalConfig              = Neo.ai?.mcp?.server?.['memory-core']?.Config;
        const originalClassHierarchy      = Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }
        if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
            delete Neo.ai.mcp.server['memory-core'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
        }

        const config = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        try {
            return await callback(config);
        } finally {
            if (originalTier1Config !== undefined) {
                Neo.ai.Config = originalTier1Config;
            } else if (Neo.ai?.Config) {
                delete Neo.ai.Config;
            }

            if (originalTier1ClassHierarchy !== undefined) {
                Neo.classHierarchyMap['Neo.ai.Config'] = originalTier1ClassHierarchy;
            } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
                delete Neo.classHierarchyMap['Neo.ai.Config'];
            }

            if (originalConfig !== undefined) {
                Neo.ai.mcp.server['memory-core'].Config = originalConfig;
            } else if (Neo.ai?.mcp?.server?.['memory-core']?.Config) {
                delete Neo.ai.mcp.server['memory-core'].Config;
            }

            if (originalClassHierarchy !== undefined) {
                Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'] = originalClassHierarchy;
            } else if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.memory-core.Config']) {
                delete Neo.classHierarchyMap['Neo.ai.mcp.server.memory-core.Config'];
            }
        }
    }

    test.beforeEach(async () => {
        tmpRoot         = path.resolve(process.cwd(), 'tmp', `compact-graphlog-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        dbPath          = path.join(tmpRoot, 'memory-core-graph.sqlite');
        bridgeStateFile = path.join(tmpRoot, 'wake-daemon', 'lastSyncId');
        wakeStateFile   = path.join(tmpRoot, 'wake-daemon', 'wakeSubscriptionLiveCursor');

        await fs.ensureDir(path.dirname(bridgeStateFile));

        db = new Database(dbPath);
        db.exec(`
            CREATE TABLE GraphLog (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id TEXT NOT NULL,
                entity_type TEXT NOT NULL
            );
            CREATE TABLE Nodes (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        `);
    });

    test.afterEach(async () => {
        db?.close();
        db = null;
        await fs.remove(tmpRoot);
    });

    function insertGraphLogRows(count) {
        const insert = db.prepare('INSERT INTO GraphLog(entity_id, entity_type) VALUES (?, ?)');

        for (let i = 1; i <= count; i++) {
            insert.run(`entity-${i}`, i % 2 === 0 ? 'nodes' : 'edges');
        }
    }

    function insertWakeSubscription(id, properties) {
        db.prepare('INSERT INTO Nodes(id, data) VALUES (?, ?)').run(id, JSON.stringify({
            id,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                status: 'active',
                ...properties
            }
        }));
    }

    test('resolves CLI defaults from the Memory Core template config in tests', async () => {
        await withMemoryCoreConfigTemplate(async MemoryCoreConfigTemplate => {
            const defaults = getDefaultGraphLogCompactionOptions({aiConfig: MemoryCoreConfigTemplate});
            const command  = createCommand({aiConfig: MemoryCoreConfigTemplate});

            command.parse([], {from: 'user'});

            expect(defaults.dbPath).toBe(MemoryCoreConfigTemplate.storagePaths.graph);
            expect(defaults.bridgeStateFile).toBe(MemoryCoreConfigTemplate.wakeDaemon.bridgeLastSyncIdPath);
            expect(defaults.wakeStateFile).toBe(MemoryCoreConfigTemplate.wakeDaemon.wakeSubscriptionLiveCursorPath);

            expect(command.opts().db).toBe(defaults.dbPath);
            expect(command.opts().bridgeStateFile).toBe(defaults.bridgeStateFile);
            expect(command.opts().wakeStateFile).toBe(defaults.wakeStateFile);
        });
    });

    test('standalone CLI bootstraps the Neo realm before loading runtime config', async () => {
        insertGraphLogRows(3);
        db.close();
        db = null;

        const runtimeConfigPath  = path.resolve(process.cwd(), 'ai/mcp/server/memory-core/config.mjs');
        const templateConfigPath = path.resolve(process.cwd(), 'ai/mcp/server/memory-core/config.template.mjs');
        const hadRuntimeConfig   = await fs.pathExists(runtimeConfigPath);

        if (!hadRuntimeConfig) {
            await fs.copy(templateConfigPath, runtimeConfigPath);
        }

        try {
            const result = spawnSync('node', [
                'ai/scripts/maintenance/compactGraphLog.mjs',
                '--db', dbPath,
                '--bridge-state-file', bridgeStateFile,
                '--wake-state-file', wakeStateFile,
                '--safety-margin', '1',
                '--consumer-watermark', 'test=3'
            ], {
                cwd     : process.cwd(),
                encoding: 'utf8',
                env     : {...process.env, UNIT_TEST_MODE: 'true'}
            });

            expect(result.status).toBe(0);
            expect(result.stderr).not.toContain('ReferenceError: Neo is not defined');
            expect(result.stdout).toContain('GraphLog compaction DRY-RUN');
            expect(result.stdout).toContain('eligible rows: 2');
        } finally {
            if (!hadRuntimeConfig) {
                await fs.remove(runtimeConfigPath);
            }
        }
    });

    test('computes cutoff from the minimum known consumer watermark plus safety margin', () => {
        const plan = computeCompactionPlan({
            stats          : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            subscriptions  : [{id: 'WAKE_SUB:1', harnessTarget: 'bridge-daemon'}],
            extraWatermarks: [parseConsumerWatermark('remote-worker=12')],
            safetyMarginRows: 2
        });

        expect(plan.canApply).toBe(true);
        expect(plan.minWatermark).toBe(12);
        expect(plan.cutoffLogId).toBe(10);
    });

    test('blocks when an active mcp-notifications consumer has no durable cursor', () => {
        const plan = computeCompactionPlan({
            stats          : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            subscriptions  : [{id: 'WAKE_SUB:2', harnessTarget: 'mcp-notifications'}],
            safetyMarginRows: 2
        });

        expect(plan.canApply).toBe(false);
        expect(plan.reason).toBe('unknown-consumer-watermark');
        expect(plan.unknownConsumers[0].name).toBe('wake-subscription-live-cursor');
    });

    test('uses a durable wake cursor when active mcp-notifications consumers exist', () => {
        const plan = computeCompactionPlan({
            stats          : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            wakeWatermark  : {name: 'wake-subscription-live-cursor', watermark: 15},
            subscriptions  : [{id: 'WAKE_SUB:2', harnessTarget: 'mcp-notifications'}],
            safetyMarginRows: 2
        });

        expect(plan.canApply).toBe(true);
        expect(plan.minWatermark).toBe(15);
        expect(plan.cutoffLogId).toBe(13);
    });

    test('dry-run reports eligible rows without deleting; apply deletes only through cutoff', () => {
        insertGraphLogRows(10);

        const dryRun = compactGraphLogRows({db, cutoffLogId: 5, apply: false});
        expect(dryRun).toEqual({eligibleRows: 5, deletedRows: 0});
        expect(getGraphLogStats({db, dbPath}).rowCount).toBe(10);

        const applied = compactGraphLogRows({db, cutoffLogId: 5, apply: true});
        expect(applied).toEqual({eligibleRows: 5, deletedRows: 5});

        const remaining = db.prepare('SELECT log_id FROM GraphLog ORDER BY log_id ASC').all().map(row => row.log_id);
        expect(remaining).toEqual([6, 7, 8, 9, 10]);
    });

    test('runGraphLogCompaction uses bridge state and preserves unsynced rows above cutoff', async () => {
        insertGraphLogRows(10);
        insertWakeSubscription('WAKE_SUB:bridge', {
            agentIdentity: '@neo-gpt',
            harnessTarget: 'bridge-daemon',
            trigger      : 'SENT_TO_ME'
        });
        await fs.writeFile(bridgeStateFile, '8', 'utf8');

        const result = runGraphLogCompaction({
            dbPath,
            bridgeStateFile,
            wakeStateFile,
            safetyMarginRows: 1,
            apply           : true,
            checkpoint      : false,
            logger          : {log: () => {}}
        });

        expect(result.plan.cutoffLogId).toBe(7);
        expect(result.compaction.deletedRows).toBe(7);

        const remaining = db.prepare('SELECT log_id FROM GraphLog ORDER BY log_id ASC').all().map(row => row.log_id);
        expect(remaining).toEqual([8, 9, 10]);
    });

    test('lists active wake subscriptions and reads missing bridge state as latest-log fallback', () => {
        insertGraphLogRows(4);
        insertWakeSubscription('WAKE_SUB:bridge', {
            agentIdentity: '@neo-gpt',
            harnessTarget: 'bridge-daemon',
            trigger      : 'SENT_TO_ME'
        });
        insertWakeSubscription('WAKE_SUB:retired', {
            agentIdentity: '@neo-gpt',
            harnessTarget: 'bridge-daemon',
            status       : 'retired',
            trigger      : 'SENT_TO_ME'
        });

        const subscriptions = listActiveWakeSubscriptions({db});
        expect(subscriptions.map(sub => sub.id)).toEqual(['WAKE_SUB:bridge']);

        const stats = getGraphLogStats({db, dbPath});
        const bridge = readWakeDaemonWatermark({stateFile: bridgeStateFile, latestLogId: stats.maxLogId});
        const missingWake = readWakeSubscriptionWatermark({stateFile: wakeStateFile});

        expect(bridge.watermark).toBe(4);
        expect(bridge.source).toContain('latest-log-id fallback');
        expect(missingWake).toBe(null);
    });
});
