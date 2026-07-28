import Database                       from 'better-sqlite3';
import path                           from 'node:path';
import {fileURLToPath}                from 'node:url';
import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module ai/scripts/diagnostics/mailboxReadStateProbe
 * @summary Classifies one mailbox recipient's durable read-state carrier directly from an
 * explicitly named graph SQLite file, without loading AiConfig, repairing graph state, or
 * mutating the inspected database.
 *
 * Direct messages carry `readAt` on the shared `MESSAGE` node. Receipt-backed broadcasts
 * carry it on the recipient's `DELIVERED_TO` edge. The probe resolves that route before
 * reading state so a missing direct-message delivery edge can never be misreported as loss.
 *
 * @example
 * node ai/scripts/diagnostics/mailboxReadStateProbe.mjs \
 *   --db-path /absolute/path/to/graph.sqlite \
 *   --message-id MESSAGE:8ccca595-55e8-4923-a13c-88c990588230 \
 *   --recipient @neo-gpt
 */

export const HELP_TEXT = `Usage:
  node ai/scripts/diagnostics/mailboxReadStateProbe.mjs \\
    --db-path <graph.sqlite> \\
    --message-id <MESSAGE:id> \\
    --recipient <agent-identity>

The database path is mandatory and is opened read-only. The probe never infers an active
AiConfig path, repairs graph state, or marks a message read.`;

/**
 * @summary Creates a stable failed-execution result for invalid inputs or an unreadable database.
 * @param {'input-error'|'open-error'} state Failure class.
 * @param {String} error Operator-facing failure detail.
 * @param {Object} [context] Validated identifiers available at the failure boundary.
 * @returns {Object}
 * @private
 */
function failureResult(state, error, context={}) {
    return {
        ok: false,
        state,
        ...context,
        error
    }
}

/**
 * @summary Creates a stable successful-inspection result, including anomaly observations.
 *
 * `ok: true` means the requested database was opened and classified. It does not mean the
 * stored state is healthy: missing, malformed, and conflicting carriers are diagnostic results.
 *
 * @param {Object} context Common database, message, and recipient identifiers.
 * @param {String} state Observed storage state.
 * @param {Object} [details] Route, carrier, or anomaly detail.
 * @returns {Object}
 * @private
 */
function observation(context, state, details={}) {
    return {
        ok: true,
        state,
        ...context,
        ...details
    }
}

/**
 * @summary Parses the diagnostic CLI's three explicit inputs without consulting process config.
 * @param {String[]} argv CLI arguments excluding node and script path.
 * @returns {Object} Parsed options, or `{help: true}`.
 * @throws {Error} For missing, duplicate, unknown, or malformed arguments.
 */
export function parseArgs(argv=[]) {
    if (!Array.isArray(argv)) {
        throw new Error('Arguments must be an array.');
    }

    if (argv.includes('--help') || argv.includes('-h')) {
        return {help: true}
    }

    const names = new Map([
        ['--db-path', 'dbPath'],
        ['--message-id', 'messageId'],
        ['--recipient', 'recipient']
    ]);
    const options = {};

    for (let index = 0; index < argv.length; index++) {
        const name = argv[index],
            key    = names.get(name);

        if (!key) {
            throw new Error(`Unknown argument: ${name}`);
        }
        if (Object.hasOwn(options, key)) {
            throw new Error(`Duplicate argument: ${name}`);
        }

        const value = argv[++index];
        if (!value || value.startsWith('--')) {
            throw new Error(`Missing value for ${name}`);
        }

        options[key] = value;
    }

    for (const [name, key] of names) {
        if (!options[key]) {
            throw new Error(`Missing required argument: ${name}`);
        }
    }

    return options
}

/**
 * @summary Validates and canonicalizes one explicit probe request.
 * @param {Object} options
 * @param {String} options.dbPath Explicit SQLite path.
 * @param {String} options.messageId MESSAGE node id.
 * @param {String} options.recipient Direct recipient identity.
 * @returns {{dbPath:String,messageId:String,recipient:String}}
 * @throws {Error} For invalid identifiers or a non-explicit path.
 * @private
 */
function validateOptions({dbPath, messageId, recipient}={}) {
    if (typeof dbPath !== 'string' || !dbPath.trim()) {
        throw new Error('dbPath must be an explicit non-empty path.');
    }
    if (typeof messageId !== 'string' || !/^MESSAGE:[^\s]+$/.test(messageId)) {
        throw new Error('messageId must use the MESSAGE:<id> graph-node form.');
    }
    if (typeof recipient !== 'string' || !recipient.trim()) {
        throw new Error('recipient must be a non-empty direct agent identity.');
    }

    const canonicalRecipient = normalizeAgentIdentityNodeId(recipient);
    if (
        typeof canonicalRecipient !== 'string' ||
        !canonicalRecipient.startsWith('@') ||
        canonicalRecipient === '@' ||
        canonicalRecipient.includes(':')
    ) {
        throw new Error('recipient must be a direct agent identity, not a role, human, or broadcast address.');
    }

    return {
        dbPath   : path.resolve(dbPath),
        messageId,
        recipient: canonicalRecipient
    }
}

/**
 * @summary Enumerates the bounded legacy SQLite spellings accepted by MailboxService comparisons.
 * @param {String} recipient Canonical direct identity.
 * @returns {String[]}
 * @private
 */
function getRecipientStorageVariants(recipient) {
    const bare = recipient.slice(1);
    return [...new Set([recipient, bare, `@${recipient}`, `AGENT:${recipient}`, `AGENT:${bare}`])]
}

/**
 * @summary Parses one persisted graph JSON record and classifies malformed or column-conflicting data.
 * @param {Object} row SQLite row.
 * @param {'node'|'edge'} kind Graph record kind.
 * @returns {Object} Parsed record or a classified storage error.
 * @private
 */
function parseGraphRecord(row, kind) {
    let record;

    try {
        record = JSON.parse(row.data);
    } catch (error) {
        return {
            errorState: 'malformed-storage',
            error     : `${kind} row ${row.id} contains malformed JSON: ${error.message}`
        }
    }

    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return {
            errorState: 'malformed-storage',
            error     : `${kind} row ${row.id} data must be a JSON object.`
        }
    }

    if (record.id !== row.id) {
        return {
            errorState: 'conflicting-storage',
            error     : `${kind} row ${row.id} disagrees with data.id ${String(record.id)}.`
        }
    }

    if (kind === 'edge') {
        for (const field of ['source', 'target', 'type']) {
            if (record[field] !== row[field]) {
                return {
                    errorState: 'conflicting-storage',
                    error     : `edge row ${row.id} column ${field}=${String(row[field])} disagrees with data.${field}=${String(record[field])}.`
                }
            }
        }
    }

    return {record}
}

/**
 * @summary Classifies a resolved carrier's `readAt` property without collapsing absence into null.
 * @param {Object} context Common inspection identifiers.
 * @param {'direct'|'broadcast'} route Resolved mailbox route.
 * @param {Object} carrier Machine-readable carrier identity.
 * @param {Object} properties Persisted carrier properties.
 * @returns {Object}
 * @private
 */
function classifyCarrierReadAt(context, route, carrier, properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        return observation(context, 'malformed-storage', {
            route,
            carrier,
            error: `${carrier.kind} ${carrier.rowId} has no object-shaped properties payload.`
        })
    }

    if (!Object.hasOwn(properties, 'readAt')) {
        return observation(context, 'malformed-storage', {
            route,
            carrier,
            error: `${carrier.kind} ${carrier.rowId} is missing properties.readAt; absence is not an explicit unread receipt.`
        })
    }

    const {readAt} = properties;
    if (readAt === null) {
        return observation(context, 'unread', {
            route,
            carrier: {...carrier, readAt: null}
        })
    }

    if (typeof readAt !== 'string') {
        return observation(context, 'malformed-storage', {
            route,
            carrier: {...carrier, readAt},
            error  : `${carrier.kind} ${carrier.rowId} properties.readAt must be null or an ISO timestamp string.`
        })
    }

    let canonical;
    try {
        canonical = new Date(readAt).toISOString();
    } catch {
        canonical = null;
    }

    if (canonical !== readAt) {
        return observation(context, 'malformed-storage', {
            route,
            carrier: {...carrier, readAt},
            error  : `${carrier.kind} ${carrier.rowId} properties.readAt is not a canonical ISO timestamp.`
        })
    }

    return observation(context, 'read', {
        route,
        carrier: {...carrier, readAt}
    })
}

/**
 * @summary Inspects one recipient's durable mailbox read-state from an explicit SQLite file.
 *
 * The database is opened with both `readonly` and `fileMustExist`, then `query_only` is enabled
 * on the connection. Direct and broadcast routes are resolved from `SENT_TO` before the matching
 * carrier is inspected. No active configuration, graph cache, WAL repair, or mailbox mutation is
 * reachable from this module.
 *
 * @param {Object} options
 * @param {String} options.dbPath Explicit graph SQLite file.
 * @param {String} options.messageId MESSAGE node id.
 * @param {String} options.recipient Affected direct recipient identity.
 * @param {Function} [options.DatabaseCtor=Database] Injectable better-sqlite3 constructor.
 * @returns {Object} Stable execution/result envelope.
 */
export function inspectMailboxReadState({dbPath, messageId, recipient, DatabaseCtor=Database}={}) {
    let validated;

    try {
        validated = validateOptions({dbPath, messageId, recipient});
    } catch (error) {
        return failureResult('input-error', error.message)
    }

    const context = {...validated};
    let db;

    try {
        db = new DatabaseCtor(validated.dbPath, {
            readonly     : true,
            fileMustExist: true
        });
        db.pragma('query_only = ON');

        const messageRows = db.prepare('SELECT id, data FROM Nodes WHERE id = ?').all(validated.messageId);
        if (messageRows.length === 0) {
            return observation(context, 'message-missing', {
                route  : null,
                carrier: null
            })
        }
        if (messageRows.length !== 1) {
            return observation(context, 'conflicting-storage', {
                route  : null,
                carrier: null,
                error  : `Expected one MESSAGE row for ${validated.messageId}; found ${messageRows.length}.`
            })
        }

        const messageParsed = parseGraphRecord(messageRows[0], 'node');
        if (messageParsed.errorState) {
            return observation(context, messageParsed.errorState, {
                route  : null,
                carrier: null,
                error  : messageParsed.error
            })
        }

        const message = messageParsed.record;
        if (message.label !== 'MESSAGE') {
            return observation(context, 'conflicting-storage', {
                route  : null,
                carrier: null,
                error  : `Node ${validated.messageId} is stored with label ${String(message.label)}, not MESSAGE.`
            })
        }

        const edgeRows = db.prepare(`
            SELECT id, source, target, type, data
            FROM Edges
            WHERE source = ? AND type IN ('SENT_TO', 'DELIVERED_TO')
            ORDER BY id
        `).all(validated.messageId);
        const edges = [];

        for (const row of edgeRows) {
            const parsed = parseGraphRecord(row, 'edge');
            if (parsed.errorState) {
                return observation(context, parsed.errorState, {
                    route  : null,
                    carrier: null,
                    error  : parsed.error
                })
            }

            edges.push(parsed.record);
        }

        const
            variants            = new Set(getRecipientStorageVariants(validated.recipient)),
            sentTo              = edges.filter(edge => edge.type === 'SENT_TO'),
            deliveries          = edges.filter(edge => edge.type === 'DELIVERED_TO'),
            directRoutes        = sentTo.filter(edge => variants.has(edge.target)),
            broadcastRoutes     = sentTo.filter(edge => edge.target === 'AGENT:*'),
            recipientDeliveries = deliveries.filter(edge => variants.has(edge.target));

        if (
            directRoutes.length > 1 ||
            broadcastRoutes.length > 1 ||
            (directRoutes.length > 0 && broadcastRoutes.length > 0) ||
            sentTo.length > 1
        ) {
            return observation(context, 'conflicting-storage', {
                route  : null,
                carrier: null,
                error  : `Message ${validated.messageId} has an ambiguous SENT_TO topology: ${sentTo.map(edge => edge.target).join(', ')}.`
            })
        }

        if (directRoutes.length === 1) {
            if (deliveries.length > 0) {
                return observation(context, 'conflicting-storage', {
                    route  : 'direct',
                    carrier: null,
                    error  : `Direct message ${validated.messageId} also has ${deliveries.length} DELIVERED_TO carrier(s).`
                })
            }

            return classifyCarrierReadAt(
                context,
                'direct',
                {kind: 'MESSAGE', rowId: validated.messageId},
                message.properties
            )
        }

        if (broadcastRoutes.length === 1) {
            if (recipientDeliveries.length === 0) {
                return observation(context, 'recipient-carrier-missing', {
                    route  : 'broadcast',
                    carrier: {
                        kind     : 'DELIVERED_TO',
                        rowId    : null,
                        recipient: validated.recipient
                    }
                })
            }
            if (recipientDeliveries.length > 1) {
                return observation(context, 'conflicting-storage', {
                    route  : 'broadcast',
                    carrier: null,
                    error  : `Broadcast ${validated.messageId} has ${recipientDeliveries.length} DELIVERED_TO carriers for ${validated.recipient}.`
                })
            }

            const delivery = recipientDeliveries[0];
            return classifyCarrierReadAt(
                context,
                'broadcast',
                {
                    kind     : 'DELIVERED_TO',
                    rowId    : delivery.id,
                    recipient: validated.recipient
                },
                delivery.properties
            )
        }

        if (deliveries.length > 0) {
            return observation(context, 'conflicting-storage', {
                route  : null,
                carrier: null,
                error  : `Message ${validated.messageId} has DELIVERED_TO carrier(s) but no SENT_TO broadcast route.`
            })
        }

        return observation(context, 'recipient-carrier-missing', {
            route  : null,
            carrier: null
        })
    } catch (error) {
        return failureResult('open-error', `Unable to inspect ${validated.dbPath}: ${error.message}`, context)
    } finally {
        db?.close();
    }
}

/**
 * @summary Executes the probe CLI and writes exactly one result document.
 * @param {String[]} [argv=process.argv.slice(2)] CLI arguments.
 * @param {Object} [io] Injectable output sinks.
 * @param {Function} [io.stdout] Standard-output writer.
 * @param {Function} [io.stderr] Standard-error writer.
 * @returns {Number} Process exit code: zero for help or a completed inspection, one for execution failure.
 */
export function runCli(
    argv=process.argv.slice(2),
    {
        stdout = value => process.stdout.write(value),
        stderr = value => process.stderr.write(value)
    }={}
) {
    let options;

    try {
        options = parseArgs(argv);
    } catch (error) {
        const result = failureResult('input-error', error.message);
        stderr(`${JSON.stringify(result, null, 2)}\n`);
        return 1
    }

    if (options.help) {
        stdout(`${HELP_TEXT}\n`);
        return 0
    }

    const result = inspectMailboxReadState(options),
        write    = result.ok ? stdout : stderr;

    write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
    process.exitCode = runCli();
}
