import {Command}                      from 'commander';
import Database                       from 'better-sqlite3';
import fs                             from 'fs-extra';
import path                           from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

/**
 * @module ai.scripts.maintenance.compactGraphLog
 * @summary Dry-run-first maintenance CLI for pruning consumed SQLite GraphLog rows.
 *
 * `GraphLog` is the Native Edge Graph CDC table. Consumers advance by durable watermarks
 * (`WHERE log_id > watermark`), so rows at or below the minimum known live-consumer
 * watermark are replay-dead. This script computes that cutoff, blocks on unknown active
 * consumers, and deletes only under `--apply`.
 *
 * Usage:
 *   node ai/scripts/maintenance/compactGraphLog.mjs
 *   node ai/scripts/maintenance/compactGraphLog.mjs --apply
 *   node ai/scripts/maintenance/compactGraphLog.mjs --apply --vacuum
 *   node ai/scripts/maintenance/compactGraphLog.mjs --consumer-watermark remote=123456
 *
 * @see ai/graph/storage/SQLite.mjs
 * @see ai/daemons/bridge/queries.mjs
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

export const DEFAULT_DB_PATH            = path.join(PROJECT_ROOT, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
export const DEFAULT_BRIDGE_STATE_FILE  = path.join(PROJECT_ROOT, '.neo-ai-data/wake-daemon/lastSyncId');
export const DEFAULT_WAKE_STATE_FILE    = path.join(PROJECT_ROOT, '.neo-ai-data/wake-daemon/wakeSubscriptionLiveCursor');
export const DEFAULT_SAFETY_MARGIN_ROWS = 1000;

/**
 * @summary Parses a non-negative integer CLI value.
 * @param {String|Number} value
 * @param {String} name
 * @returns {Number}
 */
export function parseNonNegativeInteger(value, name) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer; received ${value}`);
    }

    return parsed;
}

/**
 * @summary Parses `name=logId` consumer-watermark CLI values.
 * @param {String} value
 * @returns {{name:String, watermark:Number}}
 */
export function parseConsumerWatermark(value) {
    const separator = value.indexOf('=');

    if (separator <= 0 || separator === value.length - 1) {
        throw new Error(`Consumer watermark must use name=logId shape; received ${value}`);
    }

    return {
        name     : value.slice(0, separator),
        watermark: parseNonNegativeInteger(value.slice(separator + 1), value.slice(0, separator))
    };
}

/**
 * @summary Reads high-level GraphLog size and boundary stats.
 * @param {Object} options
 * @param {Database} options.db
 * @param {String} [options.dbPath]
 * @param {Object} [options.fsModule=fs]
 * @returns {Object}
 */
export function getGraphLogStats({db, dbPath = null, fsModule = fs}) {
    const row = db.prepare(`
        SELECT
            COUNT(*)    AS rowCount,
            MIN(log_id) AS minLogId,
            MAX(log_id) AS maxLogId
        FROM GraphLog
    `).get();

    const pageSize     = db.pragma('page_size', {simple: true});
    const pageCount    = db.pragma('page_count', {simple: true});
    const freelist     = db.pragma('freelist_count', {simple: true});
    const fileSize     = dbPath && fsModule.existsSync(dbPath) ? fsModule.statSync(dbPath).size : null;
    const graphLogSize = db.prepare(`
        SELECT COALESCE(SUM(pgsize), 0) AS bytes
        FROM dbstat
        WHERE name = 'GraphLog'
    `).get()?.bytes ?? null;

    return {
        rowCount    : row.rowCount || 0,
        minLogId    : row.minLogId || 0,
        maxLogId    : row.maxLogId || 0,
        pageSize,
        pageCount,
        freelist,
        fileSize,
        graphLogSize
    };
}

/**
 * @summary Reads the bridge daemon's durable `lastSyncId` watermark.
 * @param {Object} options
 * @param {String} options.stateFile
 * @param {Number} options.latestLogId
 * @param {Object} [options.fsModule=fs]
 * @returns {{name:String, watermark:Number, source:String}}
 */
export function readBridgeWatermark({stateFile, latestLogId, fsModule = fs}) {
    if (fsModule.existsSync(stateFile)) {
        const raw = fsModule.readFileSync(stateFile, 'utf8').trim();

        return {
            name     : 'bridge-daemon',
            watermark: parseNonNegativeInteger(raw || '0', 'bridge-daemon lastSyncId'),
            source   : stateFile
        };
    }

    // Mirrors bridge daemon boot semantics: absent state starts at current GraphLog head.
    return {
        name     : 'bridge-daemon',
        watermark: latestLogId,
        source   : 'latest-log-id fallback (state file absent)'
    };
}

/**
 * @summary Reads an optional durable WakeSubscriptionService live cursor.
 * @param {Object} options
 * @param {String} options.stateFile
 * @param {Object} [options.fsModule=fs]
 * @returns {{name:String, watermark:Number, source:String}|null}
 */
export function readWakeSubscriptionWatermark({stateFile, fsModule = fs}) {
    if (!fsModule.existsSync(stateFile)) return null;

    const raw = fsModule.readFileSync(stateFile, 'utf8').trim();

    return {
        name     : 'wake-subscription-live-cursor',
        watermark: parseNonNegativeInteger(raw || '0', 'wake-subscription-live-cursor'),
        source   : stateFile
    };
}

/**
 * @summary Lists active graph-resident wake subscriptions from SQLite.
 * @param {Object} options
 * @param {Database} options.db
 * @returns {Object[]}
 */
export function listActiveWakeSubscriptions({db}) {
    const table = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'Nodes'
    `).get();

    if (!table) return [];

    return db.prepare(`
        SELECT id, data FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
    `).all()
        .map(row => parseWakeSubscriptionRow(row))
        .filter(Boolean);
}

/**
 * @summary Converts a durable WAKE_SUBSCRIPTION node row into a compact consumer descriptor.
 * @param {Object} row
 * @returns {Object|null}
 */
export function parseWakeSubscriptionRow(row) {
    try {
        const node  = JSON.parse(row.data);
        const props = node.properties || {};

        return {
            id           : row.id,
            agentIdentity: props.agentIdentity || null,
            harnessTarget: props.harnessTarget || null,
            trigger      : props.trigger || null,
            status       : props.status || 'active'
        };
    } catch (e) {
        return null;
    }
}

/**
 * @summary Finds an explicit supplied watermark for a subscription.
 * @param {Object} subscription
 * @param {Object[]} extraWatermarks
 * @returns {Object|null}
 */
export function findExplicitSubscriptionWatermark(subscription, extraWatermarks = []) {
    const aliases = new Set([
        subscription.id,
        subscription.agentIdentity,
        subscription.harnessTarget ? `harnessTarget:${subscription.harnessTarget}` : null
    ].filter(Boolean));

    return extraWatermarks.find(entry => aliases.has(entry.name)) || null;
}

/**
 * @summary Computes the safe GraphLog compaction cutoff from known consumer watermarks.
 * @param {Object} options
 * @param {Object} options.stats
 * @param {Object} options.bridgeWatermark
 * @param {Object[]} [options.subscriptions=[]]
 * @param {Object[]} [options.extraWatermarks=[]]
 * @param {Number} [options.wakeLiveCursor=null]
 * @param {Number} [options.safetyMarginRows=DEFAULT_SAFETY_MARGIN_ROWS]
 * @returns {Object}
 */
export function computeCompactionPlan({
    stats,
    bridgeWatermark,
    subscriptions       = [],
    extraWatermarks     = [],
    wakeLiveCursor      = null,
    wakeWatermark       = null,
    safetyMarginRows    = DEFAULT_SAFETY_MARGIN_ROWS
}) {
    const consumers        = [...extraWatermarks];
    const unknownConsumers = [];
    const bridgeNeeded     = subscriptions.some(sub => sub.harnessTarget === 'bridge-daemon');
    const mcpNeeded        = subscriptions.some(sub => sub.harnessTarget === 'mcp-notifications');

    if (bridgeNeeded) {
        consumers.push(bridgeWatermark);
    }

    if (mcpNeeded) {
        if (Number.isInteger(wakeLiveCursor)) {
            consumers.push({name: 'wake-subscription-live-cursor', watermark: wakeLiveCursor});
        } else if (wakeWatermark) {
            consumers.push(wakeWatermark);
        } else {
            unknownConsumers.push({
                name  : 'wake-subscription-live-cursor',
                reason: 'active mcp-notifications subscriptions have no durable cursor file'
            });
        }
    }

    for (const sub of subscriptions) {
        if (sub.harnessTarget === 'bridge-daemon' || sub.harnessTarget === 'mcp-notifications') {
            continue;
        }

        if (sub.harnessTarget === 'disabled' || sub.harnessTarget === 'none') {
            continue;
        }

        const explicit = findExplicitSubscriptionWatermark(sub, extraWatermarks);

        if (explicit) {
            continue;
        }

        unknownConsumers.push({
            name  : sub.id,
            reason: `active ${sub.harnessTarget || 'unknown'} subscription has no supplied durable watermark`
        });
    }

    if (unknownConsumers.length > 0) {
        return {
            canApply        : false,
            cutoffLogId     : 0,
            consumers,
            unknownConsumers,
            reason          : 'unknown-consumer-watermark',
            safetyMarginRows
        };
    }

    if (consumers.length === 0) {
        return {
            canApply        : false,
            cutoffLogId     : 0,
            consumers,
            unknownConsumers,
            reason          : 'no-known-consumer-watermark',
            safetyMarginRows
        };
    }

    const minWatermark = Math.min(...consumers.map(entry => entry.watermark));
    const cutoffLogId  = Math.max(0, Math.min(stats.maxLogId, minWatermark - safetyMarginRows));

    return {
        canApply        : cutoffLogId > 0,
        cutoffLogId,
        consumers,
        unknownConsumers,
        minWatermark,
        reason          : cutoffLogId > 0 ? 'ready' : 'cutoff-not-positive',
        safetyMarginRows
    };
}

/**
 * @summary Deletes GraphLog rows through a safe cutoff, optionally dry-run only.
 * @param {Object} options
 * @param {Database} options.db
 * @param {Number} options.cutoffLogId
 * @param {Boolean} [options.apply=false]
 * @returns {{eligibleRows:Number, deletedRows:Number}}
 */
export function compactGraphLogRows({db, cutoffLogId, apply = false}) {
    const eligibleRows = db.prepare('SELECT COUNT(*) AS count FROM GraphLog WHERE log_id <= ?').get(cutoffLogId).count || 0;

    if (!apply || eligibleRows === 0) {
        return {eligibleRows, deletedRows: 0};
    }

    const result = db.prepare('DELETE FROM GraphLog WHERE log_id <= ?').run(cutoffLogId);

    return {eligibleRows, deletedRows: result.changes || 0};
}

/**
 * @summary Runs a WAL truncate checkpoint after compaction.
 * @param {Database} db
 * @returns {Object}
 */
export function checkpointWal(db) {
    return db.pragma('wal_checkpoint(TRUNCATE)');
}

/**
 * @summary Executes the full compaction planning and optional apply flow.
 * @param {Object} options
 * @returns {Object}
 */
export function runGraphLogCompaction({
    dbPath             = DEFAULT_DB_PATH,
    bridgeStateFile   = DEFAULT_BRIDGE_STATE_FILE,
    wakeStateFile     = DEFAULT_WAKE_STATE_FILE,
    safetyMarginRows  = DEFAULT_SAFETY_MARGIN_ROWS,
    extraWatermarks   = [],
    wakeLiveCursor    = null,
    apply             = false,
    vacuum            = false,
    checkpoint        = true,
    fsModule          = fs,
    logger            = console
} = {}) {
    const db = new Database(dbPath, {fileMustExist: true});

    try {
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');

        const before          = getGraphLogStats({db, dbPath, fsModule});
        const subscriptions   = listActiveWakeSubscriptions({db});
        const bridgeWatermark = readBridgeWatermark({
            stateFile  : bridgeStateFile,
            latestLogId: before.maxLogId,
            fsModule
        });
        const wakeWatermark = wakeLiveCursor === null
            ? readWakeSubscriptionWatermark({stateFile: wakeStateFile, fsModule})
            : null;
        const plan = computeCompactionPlan({
            stats: before,
            bridgeWatermark,
            subscriptions,
            extraWatermarks,
            wakeLiveCursor,
            wakeWatermark,
            safetyMarginRows
        });

        const compaction = plan.canApply
            ? compactGraphLogRows({db, cutoffLogId: plan.cutoffLogId, apply})
            : {eligibleRows: 0, deletedRows: 0};

        let checkpointResult = null;
        if (apply && checkpoint && compaction.deletedRows > 0) {
            checkpointResult = checkpointWal(db);
        }

        if (apply && vacuum && compaction.deletedRows > 0) {
            db.exec('VACUUM');
        }

        const after = getGraphLogStats({db, dbPath, fsModule});
        const result = {before, after, subscriptions, bridgeWatermark, wakeWatermark, plan, compaction, checkpointResult};

        logCompactionResult(result, {apply, vacuum, logger});

        return result;
    } finally {
        db.close();
    }
}

/**
 * @summary Logs a concise human-readable compaction report.
 * @param {Object} result
 * @param {Object} options
 */
export function logCompactionResult(result, {apply = false, vacuum = false, logger = console} = {}) {
    const {before, after, plan, compaction, subscriptions, bridgeWatermark, wakeWatermark} = result;

    logger.log(`GraphLog compaction ${apply ? 'APPLY' : 'DRY-RUN'}`);
    logger.log(`  rows: ${before.rowCount} before -> ${after.rowCount} after`);
    logger.log(`  max log_id: ${before.maxLogId}; cutoff: ${plan.cutoffLogId}; safety margin: ${plan.safetyMarginRows}`);
    logger.log(`  active wake subscriptions: ${subscriptions.length}`);
    logger.log(`  bridge watermark: ${bridgeWatermark.watermark} (${bridgeWatermark.source})`);
    logger.log(`  wake subscription watermark: ${wakeWatermark ? `${wakeWatermark.watermark} (${wakeWatermark.source})` : '(missing)'}`);

    if (!plan.canApply) {
        logger.log(`  blocked: ${plan.reason}`);
        for (const consumer of plan.unknownConsumers) {
            logger.log(`    unknown ${consumer.name}: ${consumer.reason}`);
        }
        return;
    }

    logger.log(`  eligible rows: ${compaction.eligibleRows}`);

    if (!apply) {
        logger.log('  dry-run only; re-run with --apply to delete eligible rows.');
        return;
    }

    logger.log(`  deleted rows: ${compaction.deletedRows}`);
    logger.log(`  wal checkpoint: ${compaction.deletedRows > 0 ? 'complete' : 'skipped'}`);
    logger.log(`  vacuum: ${vacuum && compaction.deletedRows > 0 ? 'complete' : 'skipped'}`);
}

/**
 * @summary Creates the CLI command object.
 * @returns {Command}
 */
export function createCommand() {
    return new Command()
        .name('compactGraphLog')
        .description('Dry-run-first GraphLog CDC compaction past known consumer watermarks.')
        .option('--apply', 'Actually delete eligible GraphLog rows. Without this flag the script is dry-run only.', false)
        .option('--db <path>', 'SQLite graph db path.', DEFAULT_DB_PATH)
        .option('--bridge-state-file <path>', 'Bridge daemon lastSyncId file.', DEFAULT_BRIDGE_STATE_FILE)
        .option('--wake-state-file <path>', 'WakeSubscriptionService live cursor file.', DEFAULT_WAKE_STATE_FILE)
        .option('--safety-margin <rows>', 'Rows to retain below the minimum known consumer watermark.', String(DEFAULT_SAFETY_MARGIN_ROWS))
        .option('--consumer-watermark <name=logId>', 'Additional durable consumer watermark. May be repeated.', collect, [])
        .option('--wake-live-cursor <logId>', 'Current WakeSubscriptionService liveCursor when active mcp-notifications consumers exist.')
        .option('--vacuum', 'Run VACUUM after deletion to physically shrink the SQLite db. Operator-gated heavy maintenance.', false);
}

/**
 * @summary Commander collector for repeatable options.
 * @param {String} value
 * @param {String[]} previous
 * @returns {String[]}
 */
function collect(value, previous) {
    previous.push(value);
    return previous;
}

/**
 * @summary Runs the CLI from process argv.
 * @param {String[]} argv
 * @returns {Object}
 */
export function runCli(argv = process.argv) {
    const command = createCommand();

    command.parse(argv);

    const options = command.opts();

    return runGraphLogCompaction({
        dbPath           : path.resolve(options.db),
        bridgeStateFile : path.resolve(options.bridgeStateFile),
        wakeStateFile   : path.resolve(options.wakeStateFile),
        safetyMarginRows: parseNonNegativeInteger(options.safetyMargin, 'safety-margin'),
        extraWatermarks : options.consumerWatermark.map(parseConsumerWatermark),
        wakeLiveCursor  : options.wakeLiveCursor === undefined
            ? null
            : parseNonNegativeInteger(options.wakeLiveCursor, 'wake-live-cursor'),
        apply           : options.apply,
        vacuum          : options.vacuum
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli();
}
