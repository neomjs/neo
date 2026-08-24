import crypto from 'crypto';
import fs     from 'fs';
import path   from 'path';
import Base   from '../../../src/core/Base.mjs';
import config from '../../mcp/server/neural-link/config.mjs';
import logger from '../../mcp/server/neural-link/logger.mjs';
import {
    admitActions             as admitActionsViaMemoryCore,
    getTransactionArchive    as getTransactionArchiveViaMemoryCore,
    recordTransactionReplay  as recordTransactionReplayViaMemoryCore,
    saveTransactionArchive   as saveTransactionArchiveViaMemoryCore
} from './memoryCoreArchiveClient.mjs';


/**
 * @summary Extracts the bounded target projection from a tool's arguments.
 *
 * **This is `GapInferenceEngine.collectNlActionTargets` moved, not re-imagined.** The allowlist used to run
 * container-side against the raw `args` column; the relocation stops raw args from ever crossing, so the
 * projection has to happen where the args still exist. Porting it faithfully is the whole point — a
 * projection that is merely SIMILAR silently changes what the digest treats as a target.
 *
 * Two conditions in it are easy to drop and both are load-bearing. A bare `id` counts only for
 * component/instance tools: every other tool's `id` names a record, a session or a window, and admitting
 * those would link weak evidence to nodes the action never touched. And the nested bags contribute only
 * `className`/`componentId`, because `config`/`properties` are user-supplied shapes where a stray `id`
 * means whatever the app author wanted it to mean.
 *
 * Deliberately not a deep walk: an unbounded traversal is how "just the targets" becomes "most of the
 * payload" the first time a tool nests something new.
 * @param {*} args The tool arguments — a JSON string on the host's log entry, or an object.
 * @param {String} [tool=''] The tool name, which decides whether a bare `id` is a component target.
 * @returns {Object} `{classNames, componentIds}`, both always arrays.
 */
function projectTargets(args, tool = '') {
    let parsed = args;

    if (typeof args === 'string') {
        try {
            parsed = JSON.parse(args)
        } catch (error) {
            return {classNames: [], componentIds: []}
        }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {classNames: [], componentIds: []}
    }

    const classNames      = new Set(),
          componentIds    = new Set(),
          isComponentTool = /component|instance/i.test(tool || ''),
          addString       = (set, value) => {
              if (typeof value === 'string' && value.length > 0) set.add(value)
          };

    for (const [key, item] of Object.entries(parsed)) {
        if (key === 'className') {
            addString(classNames, item)
        } else if (key === 'componentId' || key === 'component_id') {
            addString(componentIds, item)
        } else if (key === 'componentIds' && Array.isArray(item)) {
            item.forEach(value => addString(componentIds, value))
        } else if (key === 'id' && isComponentTool) {
            addString(componentIds, item)
        }
    }

    for (const key of ['config', 'properties']) {
        const bag = parsed[key];

        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;

        addString(classNames,   bag.className);
        addString(componentIds, bag.componentId)
    }

    return {classNames: [...classNames], componentIds: [...componentIds]}
}

/**
 * How many host sequences keep a token before the oldest is evicted.
 *
 * The map exists for the lifetime of a seat, so it needs a ceiling — an unbounded cache in a long-lived
 * possession session is a slow leak. Eviction is harmless: a sequence that has been silent for a thousand
 * newer sequences is finished, and were it to speak again it would simply start a new correlation group.
 * @type {Number}
 */
const MAX_TRACKED_SEQUENCES = 1000;

/**
 * Host sequence id → the opaque token admitted in its place.
 * @type {Map<String, String>}
 */
const correlationTokens = new Map();

/**
 * @summary Returns the opaque correlation token standing in for one host sequence id.
 *
 * The host's `sequence_id` encodes `${agentId}_${turnId}`, so the correlation key WAS the agent's
 * identity and must not cross. But correlation itself is load-bearing — `GapInferenceEngine` groups
 * actions by sequence and scores each group's success rate — so dropping the key outright would leave
 * every sequence one action long, which reads as working telemetry and is not. A per-sequence UUID keeps
 * the grouping and carries none of the identity.
 *
 * Minting host-side rather than in Memory Core is forced: `log` is fire-and-forget per action, so the
 * container sees one row at a time and has nothing to correlate them by.
 * @param {String|undefined} sequenceId The host's sequence id.
 * @returns {String} A UUID, stable for the lifetime of that sequence.
 */
function correlationTokenFor(sequenceId) {
    // An entry with no sequence correlates with nothing; a fresh token keeps it a group of one rather
    // than silently joining it to whichever sequence happened to be cached under the empty key.
    if (typeof sequenceId !== 'string' || sequenceId === '') {
        return crypto.randomUUID()
    }

    let token = correlationTokens.get(sequenceId);

    if (!token) {
        token = crypto.randomUUID();

        if (correlationTokens.size >= MAX_TRACKED_SEQUENCES) {
            correlationTokens.delete(correlationTokens.keys().next().value)
        }

        correlationTokens.set(sequenceId, token)
    }

    return token
}

/**
 * File name for the seat-local per-tool aggregate, written beside the Neural Link logs.
 * @type {String}
 */
const LOCAL_AGGREGATE_FILE = 'nl-action-aggregate.json';

/**
 * Per-tool counters for this process: tool → `{tool, count, successCount, durationMs}`.
 * @type {Map<String, Object>}
 */
const localAggregate = new Map();

/**
 * @summary Accounts one action locally, as ephemeral per-tool aggregate evidence.
 *
 * **This is not a second copy of the telemetry, and the distinction is the whole design.** It holds
 * COUNTS — tool, how many, how many succeeded, total duration — and never a target, a session or an
 * argument, so it cannot become the parallel record the relocation exists to eliminate.
 *
 * It exists because `genesisProbe` needs one: the probe drives a disposable seat and then aggregates
 * what that seat actually did. It used to read the local `nl_action_log` table, which the relocation
 * removes, and the alternative — a remote telemetry READ — is refused by this ticket's own contract,
 * because it would give the container a way to be asked about host activity. Counting locally keeps the
 * proof and the write-only direction at the same time.
 *
 * Written under `logPath`, which is already ephemeral, already rotated, and in a probe run already
 * inside the disposable root that gets deleted with it. Failures are swallowed: diagnostic accounting
 * must never take down the possession session it is describing.
 * @param {Object} entry The host's snake_case log entry.
 * @returns {void}
 */
function recordLocalAggregate(entry = {}) {
    const tool = typeof entry.tool === 'string' ? entry.tool : null;

    if (!tool) return;

    const row = localAggregate.get(tool) || {tool, count: 0, successCount: 0, durationMs: 0};

    row.count++;
    if (entry.success === true || entry.success === 1) row.successCount++;
    if (Number.isFinite(entry.duration_ms)) row.durationMs += entry.duration_ms;

    localAggregate.set(tool, row);

    try {
        fs.mkdirSync(config.logPath, {recursive: true});
        fs.writeFileSync(
            path.join(config.logPath, LOCAL_AGGREGATE_FILE),
            // Rewritten in full each time rather than appended: the file IS the running total, so a seat
            // killed mid-run leaves a complete aggregate rather than a partial journal to replay.
            JSON.stringify([...localAggregate.values()].sort((a, b) => a.tool.localeCompare(b.tool)), null, 4)
        )
    } catch (error) {
        logger.debug('[RecorderService] Local aggregate accounting unavailable:', error.message)
    }
}

/**
 * @summary Projects the host's log entry into the admitted telemetry record.
 *
 * Drops `agent_id`, `result` and the raw `args` — a census of every production READ found no reader for
 * the first two, and the third is replaced by the bounded target projection. `sequence_id` is REPLACED
 * rather than forwarded or dropped, for the reason `correlationTokenFor` documents.
 * @param {Object} entry The host's snake_case log entry.
 * @returns {Object} The admitted action.
 */
function projectActionEntry(entry = {}) {
    return {
        sequenceId: correlationTokenFor(entry.sequence_id),
        sessionId : entry.session_id ?? null,
        timestamp : entry.timestamp,
        tool      : entry.tool,
        success   : entry.success === true || entry.success === 1,
        durationMs: entry.duration_ms,
        appName   : entry.app_name ?? null,
        targets   : projectTargets(entry.args, entry.tool)
    }
}

/**
 * Refuses non-data values before transaction ops are persisted for replay.
 * @param {*} value
 * @param {String} [path='transaction']
 * @param {WeakSet} [seen]
 */
const assertArchiveDataOnly = (value, path='transaction', seen=new WeakSet()) => {
    if (typeof value === 'function') {
        throw new Error(`non-data function value at ${path}`)
    }

    if (!value || typeof value !== 'object') {
        return
    }

    if (seen.has(value)) {
        throw new Error(`cyclic data at ${path}`)
    }

    seen.add(value);

    const prototype = Object.getPrototypeOf(value);

    if (!Array.isArray(value) && prototype && prototype !== Object.prototype) {
        throw new Error(`class-backed data at ${path}`)
    }

    if (Object.hasOwn(value, 'module')) {
        throw new Error(`module class reference at ${path}.module`)
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => assertArchiveDataOnly(item, `${path}[${index}]`, seen));
        return
    }

    Object.entries(value).forEach(([key, item]) => {
        assertArchiveDataOnly(item, `${path}.${key}`, seen)
    })
};

/**
 * @summary Service to intercept and persist Neural Link tool invocations to the Native Graph database.
 * @class Neo.ai.services.neural-link.RecorderService
 * @extends Neo.core.Base
 * @singleton
 */
class RecorderService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.RecorderService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.RecorderService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
    }

    /**
     * In-flight open from `ensureStore()` — the single-flight join point for concurrent first
     * users. Transient: cleared on settle, so a failed open never pins later calls to a cached
     * failure.
     * @member {Promise<Object|null>|null} storeOpen=null
     * @protected
     */
    storeOpen = null



    /**
     * Opens the store eagerly only when action logging is enabled, so an enabled seat keeps its
     * previous boot-time behaviour. With logging disabled nothing is opened here — the archive
     * contract opens the store on its own first use instead.
     *
     * Either branch emits exactly one line, never one per tool call. The line goes through the
     * Neural Link logger deliberately: that logger is imported at module scope into every process
     * hosting this service, including servers where the Neural Link itself never runs, so a
     * misconfigured sink degrades there silently. A positive marker on both paths keeps that
     * failure observable — without one, an empty log stream would satisfy any negative sink
     * assertion.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Nothing to open. Both contracts now travel outbound to Memory Core on demand, so there is no
        // host-side store to warm at boot and no connection whose absence could silently disable a write.
        logger.info(config.actionLoggingEnabled
            ? '[RecorderService] Action logging enabled; telemetry admits to Memory Core, write-only.'
            : '[RecorderService] Action logging disabled; transaction archive available on demand.');
    }

    /**
     * Synchronously persists a specific Neural Link tool invocation into the shared memory core.
     * Guaranteed not to throw or block the main execution thread on persistence failures.
     * @param {Object} entry The invocation payload containing sequences, tool metadata, args, and execution times.
     */
    log(entry) {
        // Policy gate stays telemetry-only: the archive contract is reachable while this is off, which is
        // the independence an earlier change established and this relocation must not quietly alter.
        if (!config.actionLoggingEnabled) return;

        // Local ephemeral accounting, kept BEFORE the wire on purpose: it records what this seat did,
        // which is a different fact from what Memory Core accepted, and the genesis probe needs the
        // former. See `recordLocalAggregate`.
        recordLocalAggregate(entry);

        // Fire-and-forget on purpose. Telemetry is observability, so it must never block the tool call
        // that produced it nor surface a transport failure to it; the admission counts refusals instead.
        admitActionsViaMemoryCore({actions: [projectActionEntry(entry)]}).catch(error => {
            logger.error('[RecorderService] Failed to admit action telemetry:', error);
        });
    }



    /**
     * @summary Archives one committed App Worker transaction, in the container graph.
     *
     * The archive moved off this host's own SQLite file: it now travels outbound to Memory Core through
     * a named operation, because a host-resident store meant NL data accumulated where nothing else read
     * it and a replay depended on which checkout ran it. Neural Link itself stays host-resident — it
     * drives a real browser — but its DATA belongs where every other durable fact lives.
     *
     * The admission rules still live container-side as well as here; this method's job is the outbound
     * call, and it deliberately has no local fallback. Writing to a file when Memory Core is unreachable
     * would look kinder and would re-create the two realities the relocation removes.
     * @param {Object} params
     * @param {String} [params.appSessionId]
     * @param {String} [params.name]
     * @param {Object} params.transaction
     * @returns {Promise<Object>} `{saved: true, archiveId, sourceTxId, archivedAt, opCount, originWriter, committedAt}`
     * on admission, or `{saved: false, reason}`.
     */
    async saveTransactionArchive({appSessionId, name, transaction} = {}) {
        // Fail fast on non-data ops BEFORE the wire. JSON transport cannot carry a function or a cycle,
        // so an unserialisable op would surface container-side as a shape error with no hint of which
        // op produced it — this keeps the diagnostic where the offending value still exists.
        if (transaction?.ops) {
            try {
                assertArchiveDataOnly(transaction.ops, 'transaction.ops')
            } catch (error) {
                return {saved: false, reason: `transaction-not-data-only: ${error.message}`}
            }
        }

        return await saveTransactionArchiveViaMemoryCore({appSessionId, name, transaction})
    }

    /**
     * @summary Reads one archived transaction back for replay, from the container graph.
     * @param {Object} params
     * @param {String} params.archiveId
     * @returns {Promise<Object|null>}
     */
    async getTransactionArchive({archiveId} = {}) {
        return await getTransactionArchiveViaMemoryCore({archiveId})
    }

    /**
     * @summary Records that an archived transaction was replayed.
     * @param {Object} params
     * @param {String} params.archiveId
     * @returns {Promise<Object>} `{updated: Boolean}`
     */
    async recordTransactionReplay({archiveId} = {}) {
        return await recordTransactionReplayViaMemoryCore({archiveId})
    }
}

export default Neo.setupClass(RecorderService);
