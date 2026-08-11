#!/usr/bin/env node
/**
 * @module Neo.ai.scripts.migrations.canonicalizeStoredAgentIdentities
 * @summary Converges persisted direct AgentIdentity spellings after the guarded
 * mailbox write boundary has been deployed.
 *
 * This migration is intentionally narrower than an identity rename. It collapses
 * spelling variants of the same direct id (`neo-gpt`, `@@neo-gpt`,
 * `AGENT:@neo-gpt`) onto an existing `@neo-gpt` AgentIdentity. Addressing schemes
 * (`AGENT:*`, `AGENT:<family>/<model>`, `role:`, `human:`) remain untouched.
 *
 * Usage:
 *   node ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs
 *   node ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs --apply
 *   node ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs --db <path>
 *
 * The default is a read-only dry run. `--apply` executes the exact plan inside
 * one SQLite transaction. Quiesce graph writers and back up the database before
 * applying; restart all graph caches afterward. Read-side storage variants may
 * retire only after the applied migration reports a clean census.
 * @plane in-plane
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

const __filename = fileURLToPath(import.meta.url);

export const MAILBOX_IDENTITY_EDGE_TYPES = new Set(['DELIVERED_TO', 'SENT_BY', 'SENT_TO']);
export const PERMISSION_IDENTITY_EDGE_TYPES = new Set([
    'BLOCKED_BY',
    'CAN_READ_INBOX_OF',
    'CAN_READ_MEMORIES_OF',
    'CAN_READ_SESSIONS_OF',
    'CAN_REPLY_TO'
]);

/**
 * @summary Parses one graph JSON row and fails loudly on corrupt storage.
 * @param {String} raw Stored JSON.
 * @param {String} rowId Row id used in diagnostics.
 * @returns {Object}
 */
function parseGraphData(raw, rowId) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid graph JSON for ${rowId}: ${error.message}`);
    }
}

/**
 * @summary Returns the stored graph label across current and older row shapes.
 * @param {Object} data Parsed graph record.
 * @returns {String|undefined}
 */
function getLabel(data) {
    return data?.label || data?.type;
}

/**
 * @summary Derives a canonical direct-id candidate without resolving addressing aliases.
 * @param {*} value Stored endpoint or message property.
 * @returns {*} Canonical candidate or the unchanged non-direct value.
 */
export function getCanonicalDirectIdentityCandidate(value) {
    if (typeof value !== 'string') return value;

    const input = value.trim();
    if (!input || input === '@me' || input === 'AGENT:*' || input.startsWith('role:') || input.startsWith('human:')) {
        return input;
    }

    if (input.startsWith('AGENT:')) {
        const unwrapped = input.slice('AGENT:'.length);
        if (!unwrapped || unwrapped === '*' || unwrapped.includes('/')) return input;
        return normalizeAgentIdentityNodeId(unwrapped);
    }

    return input.includes(':') ? input : normalizeAgentIdentityNodeId(input);
}

/**
 * @summary Detects a stored direct-id spelling even when no safe destination exists yet.
 * @param {*} value Stored identity-shaped value.
 * @returns {Boolean}
 */
function isLegacyDirectIdentityValue(value) {
    const candidate = getCanonicalDirectIdentityCandidate(value);
    if (value === '@me' || candidate === '@') return true;
    return candidate !== value;
}

/**
 * @summary Builds a map of parsed node rows keyed by graph id.
 * @param {Object[]} rows SQLite node rows.
 * @returns {Map<String, Object>}
 */
function indexNodes(rows) {
    return new Map(rows.map(row => [row.id, {
        ...row,
        data: parseGraphData(row.data, row.id)
    }]));
}

/**
 * @summary Resolves a legacy direct spelling only when its canonical destination is an AgentIdentity.
 * @param {*} value Stored identity-shaped value.
 * @param {Map} nodesById Parsed node index.
 * @returns {{value: *, changed: Boolean, reason: String|null}}
 */
function resolveStoredDirectIdentity(value, nodesById) {
    const candidate = getCanonicalDirectIdentityCandidate(value);
    if (value === '@me') {
        return {value, changed: false, reason: 'stored-@me-is-unresolvable'};
    }
    if (candidate === '@') {
        return {value, changed: false, reason: `invalid-direct-identity:${String(value)}`};
    }
    if (candidate === value) return {value, changed: false, reason: null};

    const target = nodesById.get(candidate);
    if (!target) {
        return {value, changed: false, reason: `canonical-target-missing:${String(value)}->${candidate}`};
    }
    if (getLabel(target.data) !== 'AgentIdentity') {
        return {value, changed: false, reason: `canonical-target-wrong-type:${String(value)}->${candidate}`};
    }

    return {value: candidate, changed: true, reason: null};
}

/**
 * @summary Distinguishes permission BLOCKED_BY edges from the shared work/lifecycle edge type.
 * @param {Object} edge Stored or planned edge.
 * @param {Map} nodesById Parsed node index.
 * @returns {Boolean}
 */
function isPermissionIdentityEdge(edge, nodesById) {
    if (!PERMISSION_IDENTITY_EDGE_TYPES.has(edge.type)) return false;
    if (edge.type !== 'BLOCKED_BY') return true;

    // BLOCKED_BY is cross-listed with work/lifecycle. Requiring both stored endpoints
    // to be AgentIdentity nodes makes a coincidental `thing` / `@thing` name match
    // insufficient to rewrite non-permission topology.
    return getLabel(nodesById.get(edge.source)?.data) === 'AgentIdentity' &&
        getLabel(nodesById.get(edge.target)?.data) === 'AgentIdentity';
}

/**
 * @summary Merges duplicate edge payloads without erasing committed non-null state.
 * @param {Object[]} rows Planned rows sharing one canonical source/target/type triple.
 * @param {Object} keeper Row whose id survives.
 * @returns {Object} Canonical edge JSON.
 */
function mergeEdgeData(rows, keeper) {
    const properties = {};

    // Fill holes from every row first, then let the already-canonical keeper's
    // non-null values win. This preserves split DELIVERED_TO read/archive state.
    for (const row of rows) {
        for (const [key, value] of Object.entries(row.data?.properties || {})) {
            if (!(key in properties) || (properties[key] == null && value != null)) {
                properties[key] = value;
            }
        }
    }
    for (const [key, value] of Object.entries(keeper.data?.properties || {})) {
        if (value != null || !(key in properties)) properties[key] = value;
    }

    const weights = rows.map(row => row.data?.properties?.weight).filter(Number.isFinite);
    if (weights.length) properties.weight = Math.max(...weights);

    return {
        ...keeper.data,
        id        : keeper.id,
        source    : keeper.nextSource,
        target    : keeper.nextTarget,
        type      : keeper.type,
        properties
    };
}

/**
 * @summary Returns a stable semantic key for one planned edge.
 * @param {Object} edge Planned edge.
 * @returns {String}
 */
function getEdgeKey(edge) {
    return JSON.stringify([edge.nextSource, edge.nextTarget, edge.type]);
}

/**
 * @summary Adds one skip diagnostic without duplicating identical reasons.
 * @param {Set<String>} skipped Mutable skip set.
 * @param {String|null} reason Skip reason.
 */
function addSkip(skipped, reason) {
    if (reason) skipped.add(reason);
}

/**
 * @summary Plans canonical storage convergence without mutating SQLite.
 * @param {Object} db Open better-sqlite3 connection.
 * @returns {Object} Deterministic migration plan.
 */
export function planCanonicalStorageMigration(db) {
    const nodeRows  = db.prepare('SELECT id, user_id, data FROM Nodes ORDER BY id').all(),
        edgeRows    = db.prepare('SELECT id, user_id, source, target, type, data FROM Edges ORDER BY id').all(),
        nodesById   = indexNodes(nodeRows),
        aliasMap    = new Map(),
        skipped     = new Set(),
        blockers    = [];

    // A node may be globally merged only when BOTH rows are proven AgentIdentity
    // nodes. Wrong-type lookalikes remain intact; identity-semantic edges around
    // them are handled separately below.
    for (const row of nodesById.values()) {
        if (getLabel(row.data) !== 'AgentIdentity') continue;

        const resolved = resolveStoredDirectIdentity(row.id, nodesById);
        addSkip(skipped, resolved.reason);
        if (resolved.changed) {
            const canonical = nodesById.get(resolved.value);
            if ((row.user_id ?? null) !== (canonical.user_id ?? null)) {
                blockers.push(`node-user-id-disagreement:${row.id}->${resolved.value}`);
            }
            aliasMap.set(row.id, resolved.value);
        }
    }

    const plannedEdges = edgeRows.map(row => {
        const data = parseGraphData(row.data, row.id);
        let nextSource = aliasMap.get(row.source) || row.source,
            nextTarget = aliasMap.get(row.target) || row.target;

        if (MAILBOX_IDENTITY_EDGE_TYPES.has(row.type)) {
            // Current MailboxService contract: MESSAGE is the source; identity is the target.
            const resolved = resolveStoredDirectIdentity(nextTarget, nodesById);
            addSkip(skipped, resolved.reason);
            nextTarget = resolved.value;
        } else if (isPermissionIdentityEdge({source: nextSource, target: nextTarget, type: row.type}, nodesById)) {
            const source = resolveStoredDirectIdentity(nextSource, nodesById),
                target   = resolveStoredDirectIdentity(nextTarget, nodesById);
            addSkip(skipped, source.reason);
            addSkip(skipped, target.reason);
            nextSource = source.value;
            nextTarget = target.value;
        }

        return {...row, data, nextSource, nextTarget};
    });

    const groups = new Map();
    for (const edge of plannedEdges) {
        const key = getEdgeKey(edge);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(edge);
    }

    const edgeUpdates = [], edgeDeletes = [], finalEdges = [];
    for (const rows of groups.values()) {
        const changed = rows.some(row => row.source !== row.nextSource || row.target !== row.nextTarget);
        if (!changed) {
            finalEdges.push(...rows);
            continue;
        }

        const userIds = [...new Set(rows.map(row => row.user_id ?? null))];
        if (rows.length > 1 && userIds.length > 1) {
            const sample = rows[0];
            blockers.push(`edge-user-id-disagreement:${sample.nextSource}->${sample.nextTarget}:${sample.type}`);
        }

        const ordered = [...rows].sort((left, right) => {
            const leftCanonical  = left.source === left.nextSource && left.target === left.nextTarget ? 0 : 1,
                rightCanonical = right.source === right.nextSource && right.target === right.nextTarget ? 0 : 1;
            return leftCanonical - rightCanonical || left.id.localeCompare(right.id);
        });
        const keeper     = ordered[0],
            mergedData = mergeEdgeData(rows, keeper),
            nextRow    = {...keeper, source: keeper.nextSource, target: keeper.nextTarget, data: mergedData};

        edgeUpdates.push(nextRow);
        edgeDeletes.push(...ordered.slice(1));
        finalEdges.push(nextRow);
    }

    const messageNodeUpdates = [];
    for (const row of nodesById.values()) {
        if (getLabel(row.data) !== 'MESSAGE') continue;

        const sentByTargets = [...new Set(finalEdges
            .filter(edge => edge.source === row.id && edge.type === 'SENT_BY')
            .map(edge => edge.target))],
            sentToTargets = [...new Set(finalEdges
                .filter(edge => edge.source === row.id && edge.type === 'SENT_TO')
                .map(edge => edge.target))];

        if (sentByTargets.length > 1 || sentToTargets.length > 1) {
            blockers.push(`ambiguous-message-routing:${row.id}`);
            continue;
        }

        const properties = {...(row.data.properties || {})};
        let changed = false;

        for (const [property, targets] of [['from', sentByTargets], ['to', sentToTargets]]) {
            const current  = properties[property],
                resolved = resolveStoredDirectIdentity(current, nodesById);

            addSkip(skipped, resolved.reason);
            if (targets.length === 0) {
                if (resolved.changed) {
                    properties[property] = resolved.value;
                    changed = true;
                }
                continue;
            }

            const edgeTarget = targets[0],
                comparable = resolved.changed ? resolved.value : current;

            if (current != null && comparable !== edgeTarget) {
                blockers.push(`message-${property}-edge-disagreement:${row.id}:${String(current)}!=${edgeTarget}`);
                continue;
            }
            if (current !== edgeTarget) {
                properties[property] = edgeTarget;
                changed = true;
            }
        }

        if (changed) {
            messageNodeUpdates.push({...row, data: {...row.data, properties}});
        }
    }

    return {
        aliasNodes: [...aliasMap].sort(([left], [right]) => left.localeCompare(right)),
        blockers   : [...new Set(blockers)].sort(),
        edgeDeletes: edgeDeletes.sort((left, right) => left.id.localeCompare(right.id)),
        edgeUpdates: edgeUpdates.sort((left, right) => left.id.localeCompare(right.id)),
        messageNodeUpdates: messageNodeUpdates.sort((left, right) => left.id.localeCompare(right.id)),
        skipped: [...skipped].sort()
    };
}

/**
 * @summary Audits remaining canonicalizable storage rows.
 * @param {Object} db Open better-sqlite3 connection.
 * @returns {{aliasNodes: Number, identityEdgeEndpoints: Number, messageProperties: Number}}
 */
export function auditCanonicalStorage(db) {
    const nodeRows = db.prepare('SELECT id, user_id, data FROM Nodes ORDER BY id').all(),
        edgeRows   = db.prepare('SELECT id, source, target, type, data FROM Edges ORDER BY id').all(),
        nodesById  = indexNodes(nodeRows);
    let aliasNodes = 0, identityEdgeEndpoints = 0, messageProperties = 0;

    for (const row of nodesById.values()) {
        if (getLabel(row.data) === 'AgentIdentity' && isLegacyDirectIdentityValue(row.id)) {
            aliasNodes++;
        }
        if (getLabel(row.data) === 'MESSAGE') {
            for (const property of ['from', 'to']) {
                if (isLegacyDirectIdentityValue(row.data?.properties?.[property])) {
                    messageProperties++;
                }
            }
        }
    }

    for (const edge of edgeRows) {
        if (MAILBOX_IDENTITY_EDGE_TYPES.has(edge.type)) {
            if (isLegacyDirectIdentityValue(edge.target)) identityEdgeEndpoints++;
        } else if (isPermissionIdentityEdge(edge, nodesById)) {
            if (isLegacyDirectIdentityValue(edge.source)) identityEdgeEndpoints++;
            if (isLegacyDirectIdentityValue(edge.target)) identityEdgeEndpoints++;
        }
    }

    return {aliasNodes, identityEdgeEndpoints, messageProperties};
}

/**
 * @summary Runs the planned migration, optionally applying it atomically.
 * @param {Object} db Open better-sqlite3 connection.
 * @param {Boolean} [apply=false] Whether to mutate storage.
 * @returns {Object} Plan-derived statistics and before/after census.
 */
export function runCanonicalStorageMigration(db, apply = false) {
    const before = auditCanonicalStorage(db),
        plan   = planCanonicalStorageMigration(db);

    if (apply && plan.blockers.length) {
        throw new Error(`Canonical identity migration blocked: ${plan.blockers.join(', ')}`);
    }

    if (apply) {
        db.transaction(() => {
            for (const edge of plan.edgeDeletes) {
                db.prepare('DELETE FROM Edges WHERE id = ?').run(edge.id);
            }
            for (const edge of plan.edgeUpdates) {
                db.prepare('UPDATE Edges SET source = ?, target = ?, data = ? WHERE id = ?')
                    .run(edge.source, edge.target, JSON.stringify(edge.data), edge.id);
            }
            for (const node of plan.messageNodeUpdates) {
                db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(node.data), node.id);
            }
            for (const [alias] of plan.aliasNodes) {
                db.prepare('DELETE FROM Nodes WHERE id = ?').run(alias);
            }
        })();
    }

    const after = apply ? auditCanonicalStorage(db) : before,
        clean = Object.values(after).every(count => count === 0) &&
            plan.blockers.length === 0 && plan.skipped.length === 0;

    return {
        applied            : apply,
        aliasNodes         : plan.aliasNodes.length,
        blockers           : plan.blockers,
        clean,
        duplicateCollisions: plan.edgeDeletes.length,
        edgesDeleted       : plan.edgeDeletes.length,
        edgesUpdated       : plan.edgeUpdates.length,
        messageNodesUpdated: plan.messageNodeUpdates.length,
        skipped            : plan.skipped,
        before,
        after
    };
}

/**
 * @summary Parses migration CLI flags.
 * @param {String[]} argv Node argv.
 * @returns {{apply: Boolean, db: String|null, help: Boolean}}
 */
export function parseArgs(argv) {
    const args = {apply: false, db: null, help: false};
    for (let index = 2; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--apply') args.apply = true;
        else if (arg === '--db') {
            if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
                throw new Error('--db requires a non-flag path');
            }
            args.db = argv[++index];
        }
        else if (arg === '--help') args.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return args;
}

function printUsage() {
    console.log(`Usage: node ai/scripts/migrations/canonicalizeStoredAgentIdentities.mjs [options]\n\nOptions:\n  (no flags)   Dry-run only\n  --apply      Apply atomically\n  --db <path>  Override the SQLite graph path\n  --help       Show this help`);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        return;
    }

    let dbPath = args.db;
    if (!dbPath) {
        // Genuine CLI entrypoint: consume the reactive AiConfig SSOT lazily at the use site.
        // Keeping this behind --help preserves bootstrap-free imports and flag discovery.
        await import('../../../src/Neo.mjs');
        await import('../../../src/core/_export.mjs');
        const {default: aiConfig} = await import('../../mcp/server/memory-core/config.mjs');
        dbPath = aiConfig.storagePaths.graph;
    }

    const {default: Database} = await import('better-sqlite3'),
        db = new Database(dbPath, {verbose: null});

    try {
        const result = runCanonicalStorageMigration(db, args.apply);
        console.log(JSON.stringify({dbPath, ...result}, null, 2));
        if (!args.apply) console.log('\nDry-run complete. Re-run with --apply after reviewing the plan.');
    } finally {
        db.close();
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === __filename) {
    main().catch(error => {
        console.error(`[canonicalizeStoredAgentIdentities] FATAL: ${error.message}`);
        process.exitCode = 1;
    });
}
