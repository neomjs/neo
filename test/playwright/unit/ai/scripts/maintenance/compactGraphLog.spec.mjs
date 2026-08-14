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
    buildGraphLogCompactionOutcome,
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

    /**
     * @summary Runs a callback against a construction-isolated Memory Core config proxy.
     * @param {Function} callback The operation that consumes the isolated config.
     * @returns {Promise<*>} The callback result.
     */
    async function withMemoryCoreConfigTemplate(callback) {
        const [
                  {default: ConfigBase},
                  {createConfigProxy}
              ]      = await Promise.all([
                  import('../../../../../../ai/mcp/server/memory-core/configBase.mjs'),
                  import('../../../../../../ai/ConfigProvider.mjs')
              ]),
              config = createConfigProxy(Neo.create(ConfigBase));

        try {
            return await callback(config);
        } finally {
            config.destroy();
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
        const runtimeConfigBefore = Neo.ai?.mcp?.server?.['memory-core']?.Config;

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

        // The fixture is construction-isolated. Deleting and later restoring this singleton while
        // importing config.template.mjs can strand its cached proxy on a different instance from
        // config.mjs, so later specs refresh one config while production services read another.
        expect(Neo.ai?.mcp?.server?.['memory-core']?.Config).toBe(runtimeConfigBefore);
    });

    test('#16681: standalone CLI boots runtime config and distinguishes structured apply outcomes', async () => {
        insertGraphLogRows(3);
        db.close();
        db = null;

        const runtimeConfigPath  = path.resolve(process.cwd(), 'ai/mcp/server/memory-core/config.mjs');
        const templateConfigPath = path.resolve(process.cwd(), 'ai/mcp/server/memory-core/config.template.mjs');
        const hadRuntimeConfig   = await fs.pathExists(runtimeConfigPath);

        if (!hadRuntimeConfig) {
            await fs.copy(templateConfigPath, runtimeConfigPath);
        }

        const pathArgs = [
            '--db', dbPath,
            '--bridge-state-file', bridgeStateFile,
            '--wake-state-file', wakeStateFile,
            '--safety-margin', '1',
            '--consumer-watermark', 'test=3'
        ];
        const run = flags => spawnSync('node', [
            'ai/scripts/maintenance/compactGraphLog.mjs',
            ...flags,
            ...pathArgs
        ], {
            cwd     : process.cwd(),
            encoding: 'utf8',
            env     : {...process.env, UNIT_TEST_MODE: 'true'}
        });

        try {
            const humanReadable = run([]);

            expect(humanReadable.status).toBe(0);
            expect(humanReadable.stderr).not.toContain('ReferenceError: Neo is not defined');
            expect(humanReadable.stdout).toContain('GraphLog compaction DRY-RUN');
            expect(humanReadable.stdout).toContain('eligible rows: 2');

            const applied = run(['--apply', '--json']);

            expect(applied.status).toBe(0);
            expect(JSON.parse(applied.stdout)).toEqual(expect.objectContaining({
                success     : true,
                deferred    : false,
                status      : 'applied',
                reason      : 'ready',
                beforeRows  : 3,
                afterRows   : 1,
                cutoffLogId : 2,
                eligibleRows: 2,
                deletedRows : 2
            }));

            const upToDate = run(['--apply', '--json']);

            expect(upToDate.status).toBe(0);
            expect(JSON.parse(upToDate.stdout)).toEqual(expect.objectContaining({
                success     : true,
                deferred    : false,
                status      : 'up-to-date',
                reason      : 'ready',
                beforeRows  : 1,
                afterRows   : 1,
                cutoffLogId : 2,
                eligibleRows: 0,
                deletedRows : 0
            }));

            const mutationDb = new Database(dbPath);
            mutationDb.prepare('INSERT INTO Nodes(id, data) VALUES (?, ?)').run('WAKE_SUB:mcp', JSON.stringify({
                id        : 'WAKE_SUB:mcp',
                label     : 'WAKE_SUBSCRIPTION',
                properties: {
                    agentIdentity: '@neo-gpt-emmy',
                    harnessTarget: 'mcp-notifications',
                    status       : 'active',
                    trigger      : 'SENT_TO_ME'
                }
            }));
            mutationDb.close();

            const blocked = run(['--apply', '--json']);

            expect(blocked.status).toBe(0);
            expect(JSON.parse(blocked.stdout)).toEqual(expect.objectContaining({
                success     : true,
                deferred    : true,
                status      : 'safety-blocked',
                reason      : 'unknown-consumer-watermark',
                beforeRows  : 1,
                afterRows   : 1,
                cutoffLogId : 0,
                eligibleRows: 0,
                deletedRows : 0
            }));
        } finally {
            if (!hadRuntimeConfig) {
                await fs.remove(runtimeConfigPath);
            }
        }
    });

    test('computes cutoff from the minimum known consumer watermark plus safety margin', () => {
        const plan = computeCompactionPlan({
            stats              : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            subscriptions      : [{id: 'WAKE_SUB:1', harnessTarget: 'bridge-daemon'}],
            extraWatermarks    : [parseConsumerWatermark('remote-worker=12')],
            safetyMarginRows   : 2
        });

        expect(plan.canApply).toBe(true);
        expect(plan.minWatermark).toBe(12);
        expect(plan.cutoffLogId).toBe(10);
    });

    test('blocks when an active mcp-notifications consumer has no durable cursor', () => {
        const plan = computeCompactionPlan({
            stats              : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            subscriptions      : [{id: 'WAKE_SUB:2', harnessTarget: 'mcp-notifications'}],
            safetyMarginRows   : 2
        });

        expect(plan.canApply).toBe(false);
        expect(plan.reason).toBe('unknown-consumer-watermark');
        expect(plan.unknownConsumers[0].name).toBe('wake-subscription-live-cursor');
    });

    test('uses a durable wake cursor when active mcp-notifications consumers exist', () => {
        const plan = computeCompactionPlan({
            stats              : {maxLogId: 20},
            wakeDaemonWatermark: {name: 'bridge-daemon', watermark: 18},
            wakeWatermark      : {name: 'wake-subscription-live-cursor', watermark: 15},
            subscriptions      : [{id: 'WAKE_SUB:2', harnessTarget: 'mcp-notifications'}],
            safetyMarginRows   : 2
        });

        expect(plan.canApply).toBe(true);
        expect(plan.minWatermark).toBe(15);
        expect(plan.cutoffLogId).toBe(13);
    });

    test('#16681: distinguishes a consumer-blocked cutoff from a retained short log', () => {
        const blockedPlan = computeCompactionPlan({
            stats              : {maxLogId: 20},
            wakeDaemonWatermark: null,
            extraWatermarks    : [parseConsumerWatermark('remote-worker=1')],
            safetyMarginRows   : 2
        });
        const blockedOutcome = buildGraphLogCompactionOutcome({
            before    : {rowCount: 20},
            after     : {rowCount: 20},
            plan      : blockedPlan,
            compaction: {eligibleRows: 0, deletedRows: 0}
        }, {apply: true});

        expect(blockedPlan).toEqual(expect.objectContaining({
            canApply   : false,
            disposition: 'safety-blocked',
            reason     : 'no-safe-cutoff'
        }));
        expect(blockedOutcome).toEqual(expect.objectContaining({
            deferred: true,
            status  : 'safety-blocked',
            reason  : 'no-safe-cutoff'
        }));

        const upToDatePlan = computeCompactionPlan({
            stats              : {maxLogId: 2},
            wakeDaemonWatermark: null,
            extraWatermarks    : [parseConsumerWatermark('remote-worker=2')],
            safetyMarginRows   : 2
        });
        const upToDateOutcome = buildGraphLogCompactionOutcome({
            before    : {rowCount: 2},
            after     : {rowCount: 2},
            plan      : upToDatePlan,
            compaction: {eligibleRows: 0, deletedRows: 0}
        }, {apply: true});

        expect(upToDatePlan).toEqual(expect.objectContaining({
            canApply   : false,
            disposition: 'up-to-date',
            reason     : 'nothing-to-compact'
        }));
        expect(upToDateOutcome).toEqual(expect.objectContaining({
            deferred: false,
            status  : 'up-to-date',
            reason  : 'nothing-to-compact'
        }));
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

        const stats       = getGraphLogStats({db, dbPath});
        const bridge      = readWakeDaemonWatermark({stateFile: bridgeStateFile, latestLogId: stats.maxLogId});
        const missingWake = readWakeSubscriptionWatermark({stateFile: wakeStateFile});

        expect(bridge.watermark).toBe(4);
        expect(bridge.source).toContain('latest-log-id fallback');
        expect(missingWake).toBe(null);
    });
});
