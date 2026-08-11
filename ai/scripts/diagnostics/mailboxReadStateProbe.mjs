/**
 * @plane in-plane
 */
import Database        from 'better-sqlite3';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    classifyMailboxReadState,
    createMailboxReadStateFailure,
    validateMailboxReadStateRequest
} from '../../services/memory-core/helpers/mailboxReadStateClassifier.mjs';

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
    const validated = validateMailboxReadStateRequest({messageId, recipient});

    return {
        dbPath   : path.resolve(dbPath),
        ...validated
    }
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
        return createMailboxReadStateFailure('input-error', error.message)
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
        const edgeRows    = db.prepare(`
            SELECT id, source, target, type, data
            FROM Edges
            WHERE source = ? AND type IN ('SENT_TO', 'DELIVERED_TO')
            ORDER BY id
        `).all(validated.messageId);

        return classifyMailboxReadState({
            messageId: validated.messageId,
            recipient: validated.recipient,
            messageRows,
            edgeRows,
            context  : {dbPath: validated.dbPath}
        })
    } catch (error) {
        return createMailboxReadStateFailure('open-error', `Unable to inspect ${validated.dbPath}: ${error.message}`, context)
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
        const result = createMailboxReadStateFailure('input-error', error.message);
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
