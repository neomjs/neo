#!/usr/bin/env node
/**
 * @summary One-shot migration script that patches legacy bridge-daemon wake subscriptions
 * to eliminate hardcoded fallbacks and adopt identity-template-based route metadata.
 *
 * Legacy `bridge-daemon` wake subscriptions can contain hardcoded or stale
 * route metadata when they were not seeded from the owning identity. This
 * script updates existing `WAKE_SUBSCRIPTION` nodes by pulling the canonical
 * explicit metadata from `identityRoots.mjs`, with the durable `AgentIdentity`
 * row as a fallback for out-of-tree identities.
 *
 * **Usage**:
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs             # dry-run (default)
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --apply     # commit the migration
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --skip-generic-cleanup
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --db <path> # override SQLite path
 *   node ai/scripts/migrations/migrateWakeSubscriptions.mjs --help      # print usage
 * @plane in-plane
 */

import {program}       from 'commander';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {IDENTITIES}    from '../../graph/identityRoots.mjs';

import {
    isActiveWakeSubscriptionStatus,
    WAKE_SUBSCRIPTION_DEFAULT_STATUS
} from '../../services/memory-core/wakeSubscriptionStatusPolicy.mjs';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const neoRoot    = path.resolve(__dirname, '../..');

program
    .name('migrateWakeSubscriptions')
    .description('Patch legacy bridge-daemon wake subscriptions onto identity-template route metadata (dry-run by default).')
    .option('--apply', 'Commit the migration atomically in a single transaction')
    .option('--audit', 'Read-only audit — report instance-addressing-unsafe wake routes (no changes)')
    .option('--skip-generic-cleanup', 'Skip unresolved generic named-peer default-instance cleanup planning/apply')
    .option('--db <path>', 'Override the SQLite file path (default: .neo-ai-data/sqlite/memory-core-graph.sqlite)')
    .addHelpText('after', '\n  (no flags)  Dry-run — print the migration plan without committing.');

/**
 * @summary Resolves the canonical wake route template for an AgentIdentity.
 *
 * `identityRoots.mjs` is the source of truth for first-party Neo identities; the durable graph row
 * remains a fallback for local or out-of-tree identities that are not part of the committed roster.
 *
 * @param {String} agentId AgentIdentity node id.
 * @param {Object} agentData Parsed durable AgentIdentity graph node.
 * @returns {Object|undefined} Subscription template.
 */
function resolveSubscriptionTemplate(agentId, agentData) {
    const sourceIdentity = IDENTITIES.find(identity => identity.id === agentId),
          sourceTemplate = sourceIdentity?.properties?.subscriptionTemplate;

    return sourceTemplate || agentData.properties?.subscriptionTemplate;
}

export function runMigration(db, applyOrOptions = false) {
    const options = typeof applyOrOptions === 'boolean' ? {apply: applyOrOptions} : applyOrOptions,
          apply   = options.apply === true,
          now     = options.now || new Date().toISOString();

    const stats = {
        subscriptionsPatched       : 0,
        subscriptionsSkipped       : 0,
        genericDefaultMarked       : 0,
        genericDuplicatesRetired   : 0,
        genericNamedPeerUnresolved : 0
    };

    const work = () => {
        // Find all WAKE_SUBSCRIPTION nodes
        const subs = db.prepare(`SELECT id, data FROM Nodes WHERE json_extract(data, '$.label') = ?`).all('WAKE_SUBSCRIPTION');

        for (const sub of subs) {
            let data;
            try {
                data = JSON.parse(sub.data);
            } catch (e) {
                console.warn(`  [SKIP] Invalid JSON in subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            const props = data.properties || {};
            if (props.harnessTarget !== 'bridge-daemon') {
                stats.subscriptionsSkipped++;
                continue;
            }

            const agentId = props.agentIdentity;
            if (!agentId) {
                stats.subscriptionsSkipped++;
                continue;
            }

            // Get owner AgentIdentity
            const agentRow = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(agentId);
            if (!agentRow) {
                console.warn(`  [SKIP] Owner ${agentId} missing for subscription ${sub.id}`);
                stats.subscriptionsSkipped++;
                continue;
            }

            let agentData;
            try {
                agentData = JSON.parse(agentRow.data);
            } catch (e) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const template = resolveSubscriptionTemplate(agentId, agentData);
            if (!template || !template.harnessTargetMetadata || !template.harnessTargetMetadata.appName) {
                stats.subscriptionsSkipped++;
                continue;
            }

            const expectedMetadata = template.harnessTargetMetadata,
                  currentMetadata  = props.harnessTargetMetadata || {},
                  metadataPatch    = {};

            for (const [key, value] of Object.entries(expectedMetadata)) {
                if (currentMetadata[key] !== value) {
                    metadataPatch[key] = value;
                }
            }

            if (Object.keys(metadataPatch).length > 0) {
                const delta = Object.entries(metadataPatch)
                    .map(([key, value]) => `${key}: ${currentMetadata[key] !== undefined ? currentMetadata[key] : 'none'} → ${value !== undefined ? value : 'none'}`)
                    .join(', ');

                console.log(`  [PATCH] Subscription ${sub.id} (Owner: ${agentId}) | ${delta}`);

                if (apply) {
                    props.harnessTargetMetadata = {
                        ...currentMetadata,
                        ...metadataPatch
                    };
                    data.properties = props;

                    db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(data), sub.id);
                }
                stats.subscriptionsPatched++;
            } else {
                stats.subscriptionsSkipped++;
            }
        }

        if (options.cleanupGenericNamedPeer !== false) {
            const cleanup = cleanupGenericNamedPeerRoutes(db, {apply, now});
            stats.genericDefaultMarked       += cleanup.defaultMarked;
            stats.genericDuplicatesRetired   += cleanup.duplicatesRetired;
            stats.genericNamedPeerUnresolved += cleanup.unresolved;
        }
    };

    if (apply) {
        const transaction = db.transaction(work);
        transaction();
    } else {
        work();
    }

    return stats;
}

/**
 * @summary Cleans active app-only named-peer wake routes without writing operator-local paths.
 *
 * A generic app-only Shape C route can be valid only as the default app instance. This maintenance
 * pass makes that intent durable (`defaultInstance: true`) and retires duplicate active rows that
 * share the same owner/trigger/filter/app tuple. Instance-addressed rows remain untouched.
 *
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Object} [options]
 * @param {Boolean} [options.apply=false] Whether to commit planned mutations.
 * @param {String} [options.now] ISO timestamp used for durable mutation metadata.
 * @returns {{defaultMarked: Number, duplicatesRetired: Number, unresolved: Number}}
 */
export function cleanupGenericNamedPeerRoutes(db, {apply = false, now = new Date().toISOString()} = {}) {
    const groups = new Map();

    for (const record of readBridgeSubscriptionRecords(db)) {
        const props = record.data.properties || {};

        if (!isActiveSubscription(props) || !isUnresolvedGenericNamedPeer(record)) continue;

        const key = buildGenericNamedPeerCleanupKey(record);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
    }

    const stats = {defaultMarked: 0, duplicatesRetired: 0, unresolved: 0};

    for (const group of groups.values()) {
        const ordered = group.sort(compareNewestSubscriptionFirst),
              keeper  = ordered[0],
              retired = ordered.slice(1);

        markDefaultInstance(keeper, {apply, db, now});
        stats.defaultMarked++;

        for (const record of retired) {
            retireDuplicateGenericRoute(record, {apply, db, now});
            stats.duplicatesRetired++;
        }
    }

    stats.unresolved = auditWakeRoutes(db).genericNamedPeer.length;

    return stats;
}

/**
 * @summary Reads parsed bridge-daemon WAKE_SUBSCRIPTION rows from the graph.
 * @param {Object} db Open better-sqlite3 connection.
 * @returns {Object[]} Parsed subscription records.
 */
function readBridgeSubscriptionRecords(db) {
    const rows = db.prepare(`SELECT id, data FROM Nodes WHERE json_extract(data, '$.label') = ?`).all('WAKE_SUBSCRIPTION'),
          out  = [];

    for (const row of rows) {
        let data;
        try {
            data = JSON.parse(row.data);
        } catch (e) {
            continue;
        }

        const props = data.properties || {};
        if (props.harnessTarget !== 'bridge-daemon') continue;

        out.push({id: row.id, data});
    }

    return out;
}

function isActiveSubscription(props = {}) {
    return isActiveWakeSubscriptionStatus(props.status);
}

function isDefaultInstanceRoute(meta = {}) {
    return meta.defaultInstance === true || meta.routeResolution === 'default-instance';
}

function isUnresolvedGenericNamedPeer(record) {
    const namedIds = new Set(IDENTITIES.map(identity => identity.id)),
          props    = record.data.properties || {},
          meta     = props.harnessTargetMetadata || {},
          {addressType} = resolveRouteAddress(meta);

    return !addressType && meta.appName && namedIds.has(props.agentIdentity) && !isDefaultInstanceRoute(meta);
}

function buildGenericNamedPeerCleanupKey(record) {
    const props = record.data.properties || {},
          meta  = props.harnessTargetMetadata || {};

    return stableStringify({
        agentIdentity: props.agentIdentity,
        trigger      : props.trigger,
        filters      : props.filters || {},
        appName      : meta.appName
    });
}

function compareNewestSubscriptionFirst(a, b) {
    const timeDelta = readSubscriptionTime(b) - readSubscriptionTime(a);
    if (timeDelta !== 0) return timeDelta;

    return a.id.localeCompare(b.id);
}

function readSubscriptionTime(record) {
    const props = record.data.properties || {},
          time  = Date.parse(props.updatedAt || props.createdAt || '');

    return Number.isFinite(time) ? time : 0;
}

function markDefaultInstance(record, {apply, db, now}) {
    const props = record.data.properties || {},
          meta  = props.harnessTargetMetadata || {};

    console.log(`  [MARK-DEFAULT] Subscription ${record.id} (Owner: ${props.agentIdentity}) | defaultInstance: ${meta.defaultInstance === true ? 'true' : 'none'} → true, routeResolution: ${meta.routeResolution || 'none'} → default-instance`);

    if (!apply) return;

    props.harnessTargetMetadata = {
        ...meta,
        defaultInstance : true,
        routeResolution : 'default-instance',
        routeResolvedAt : now,
        routeResolvedBy : 'migrateWakeSubscriptions#genericNamedPeer'
    };
    props.updatedAt = now;
    record.data.properties = props;

    writeSubscriptionRecord(db, record);
}

function retireDuplicateGenericRoute(record, {apply, db, now}) {
    const props = record.data.properties || {};

    console.log(`  [RETIRE-GENERIC] Subscription ${record.id} (Owner: ${props.agentIdentity}) | status: ${props.status ?? WAKE_SUBSCRIPTION_DEFAULT_STATUS} → inactive duplicate generic default-instance route`);

    if (!apply) return;

    props.status        = 'inactive';
    props.retiredAt     = now;
    props.retiredReason = 'duplicate generic named-peer default-instance route (#13744)';
    props.updatedAt     = now;
    record.data.properties = props;

    writeSubscriptionRecord(db, record);
}

function writeSubscriptionRecord(db, record) {
    db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(record.data), record.id);
}

/**
 * @summary Resolve a wake route's effective instance address, mirroring
 * `WakeSubscriptionService._resolvePresenceAddress` / the wake daemon's resolver: an explicit
 * `addressType` wins, else a legacy `userDataDir` field implies the `userDataDir` type; the address
 * comes from `instanceAddress`, falling back to `userDataDir` for that type.
 * @param {Object} [meta] harnessTargetMetadata.
 * @returns {{addressType: (String|null), instanceAddress: (String|null)}}
 */
export function resolveRouteAddress(meta = {}) {
    const addressType     = meta.addressType || (meta.userDataDir ? 'userDataDir' : null),
          instanceAddress = meta.instanceAddress || (addressType === 'userDataDir' ? meta.userDataDir : null);

    return {addressType: addressType || null, instanceAddress: instanceAddress || null};
}

/**
 * @summary Read-only audit surfacing bridge-daemon wake routes that are unsafe under same-app
 * multi-instance addressing. Two categories:
 *
 * - `emptyAddress`: an `addressType` (or legacy `userDataDir`) is present but resolves to NO
 *   instance address. The wake daemon fails closed on these at delivery, so the owning peer
 *   silently misses every wake — a liveness hole (not a cross-leak).
 * - `genericNamedPeer`: a first-party named identity (in `identityRoots`) on an `appName`-only
 *   route with no resolvable instance address. Once more than one instance of that app runs, a
 *   generic route is ambiguous — verify it's the deliberate default instance or assign an address.
 *
 * Pairs with the registration-time guard (`WakeSubscriptionService.validateHarnessTargetMetadata`),
 * which blocks NEW unsafe rows; this audit surfaces pre-existing ones for cleanup.
 *
 * @param {Object} db Open better-sqlite3 connection.
 * @returns {{emptyAddress: Object[], genericNamedPeer: Object[], defaultInstance: Object[], scanned: Number}}
 */
export function auditWakeRoutes(db) {
    const namedIds         = new Set(IDENTITIES.map(identity => identity.id)),
          subs             = readBridgeSubscriptionRecords(db),
          emptyAddress     = [],
          genericNamedPeer = [],
          defaultInstance  = [];

    let scanned = 0;

    for (const sub of subs) {
        const props = sub.data.properties || {};
        if (!isActiveSubscription(props)) continue;
        scanned++;

        const meta = props.harnessTargetMetadata || {},
              {addressType, instanceAddress} = resolveRouteAddress(meta);

        if (addressType && !instanceAddress) {
            emptyAddress.push({id: sub.id, agentIdentity: props.agentIdentity || null, addressType, appName: meta.appName || null});
        } else if (!addressType && meta.appName && namedIds.has(props.agentIdentity) && isDefaultInstanceRoute(meta)) {
            defaultInstance.push({id: sub.id, agentIdentity: props.agentIdentity, appName: meta.appName});
        } else if (!addressType && meta.appName && namedIds.has(props.agentIdentity)) {
            genericNamedPeer.push({id: sub.id, agentIdentity: props.agentIdentity, appName: meta.appName});
        }
    }

    return {emptyAddress, genericNamedPeer, defaultInstance, scanned};
}

/**
 * @summary Print an {@link auditWakeRoutes} result to stdout.
 * @param {{emptyAddress: Object[], genericNamedPeer: Object[], defaultInstance: Object[], scanned: Number}} audit
 * @returns {void}
 */
function reportAudit({emptyAddress, genericNamedPeer, defaultInstance = [], scanned}) {
    console.log(`[migrateWakeSubscriptions] AUDIT — scanned ${scanned} bridge-daemon wake route(s)`);
    console.log();
    console.log(`  empty-address (addressType set, no resolvable instance address → fails closed at delivery, peer misses wakes): ${emptyAddress.length}`);
    for (const r of emptyAddress) {
        console.log(`    [EMPTY]   ${r.id}  owner=${r.agentIdentity}  addressType=${r.addressType}  app=${r.appName}`);
    }
    console.log();
    console.log(`  generic-named-peer (named identity on an appName-only route → ambiguous with multiple same-app instances; verify default instance or assign an address): ${genericNamedPeer.length}`);
    for (const r of genericNamedPeer) {
        console.log(`    [GENERIC] ${r.id}  owner=${r.agentIdentity}  app=${r.appName}`);
    }
    console.log();
    console.log(`  default-instance (named identity on an appName-only route explicitly marked as intentional default instance): ${defaultInstance.length}`);
    for (const r of defaultInstance) {
        console.log(`    [DEFAULT] ${r.id}  owner=${r.agentIdentity}  app=${r.appName}`);
    }
    console.log();
    console.log(`[migrateWakeSubscriptions] AUDIT complete (read-only; no changes).`);
}

function stableStringify(value) {
    return JSON.stringify(stableNormalize(value));
}

function stableNormalize(value) {
    if (Array.isArray(value)) {
        return value.map(stableNormalize);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((out, key) => {
            out[key] = stableNormalize(value[key]);
            return out;
        }, {});
    }

    return value;
}

async function main() {
    program.parse(process.argv);
    const args = program.opts();

    const dbPath = args.db || path.resolve(neoRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');
    console.log(`[migrateWakeSubscriptions] target: ${dbPath}`);
    console.log(`[migrateWakeSubscriptions] mode:   ${args.audit ? 'AUDIT (read-only)' : args.apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log();

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, {verbose: null});

    try {
        if (args.audit) {
            reportAudit(auditWakeRoutes(db));
            return;
        }

        const stats = runMigration(db, {
            apply                  : args.apply,
            cleanupGenericNamedPeer: !args.skipGenericCleanup
        });

        console.log();
        console.log(`[migrateWakeSubscriptions] summary:`);
        console.log(`  subscriptions patched       : ${stats.subscriptionsPatched}`);
        console.log(`  subscriptions skipped       : ${stats.subscriptionsSkipped}`);
        console.log(`  generic default marked      : ${stats.genericDefaultMarked}`);
        console.log(`  generic duplicates retired  : ${stats.genericDuplicatesRetired}`);
        console.log(`  generic unresolved remaining: ${stats.genericNamedPeerUnresolved}`);

        if (!args.apply) {
            console.log();
            console.log(`[migrateWakeSubscriptions] DRY-RUN complete. No changes applied.`);
            console.log(`[migrateWakeSubscriptions] Re-run with --apply to commit.`);
        } else {
            console.log();
            console.log(`[migrateWakeSubscriptions] APPLY complete. Migration committed.`);
        }
    } finally {
        db.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error('[migrateWakeSubscriptions] FATAL:', err);
        process.exit(1);
    });
}
