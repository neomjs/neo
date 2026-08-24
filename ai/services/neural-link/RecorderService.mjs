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
 * Argument keys whose values name a Neural Link TARGET. Everything else in a tool's arguments is dropped
 * before telemetry leaves the host: raw args can carry app state, user content or a private `thought`,
 * none of which telemetry needs and none of which should become durable because a tool call included it.
 * @type {String[]}
 */
const TARGET_CLASS_KEYS = Object.freeze(['className']),
      TARGET_ID_KEYS    = Object.freeze(['componentId', 'component_id', 'id']);

/**
 * @summary Extracts the bounded target projection from a tool's arguments.
 *
 * Walks one level plus the two nested bags NL tools actually use (`config`, `properties`), which is the
 * shape `GapInferenceEngine` already consumes. Deliberately not a deep walk: an unbounded traversal is
 * how "just the targets" becomes "most of the payload" the first time a tool nests something new.
 * @param {*} args The tool arguments — a JSON string on the host's log entry, or an object.
 * @returns {Object} `{classNames, componentIds}`, both always arrays.
 */
function projectTargets(args) {
    let parsed = args;

    if (typeof args === 'string') {
        try {
            parsed = JSON.parse(args)
        } catch (error) {
            return {classNames: [], componentIds: []}
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        return {classNames: [], componentIds: []}
    }

    const classNames   = new Set(),
          componentIds = new Set(),
          collect      = bag => {
              if (!bag || typeof bag !== 'object') return;

              for (const key of TARGET_CLASS_KEYS) {
                  if (typeof bag[key] === 'string') classNames.add(bag[key])
              }

              for (const key of TARGET_ID_KEYS) {
                  if (typeof bag[key] === 'string') componentIds.add(bag[key])
              }

              if (Array.isArray(bag.componentIds)) {
                  bag.componentIds.filter(v => typeof v === 'string').forEach(v => componentIds.add(v))
              }
          };

    collect(parsed);
    collect(parsed.config);
    collect(parsed.properties);

    return {classNames: [...classNames], componentIds: [...componentIds]}
}

/**
 * @summary Projects the host's log entry into the admitted telemetry record.
 *
 * Drops `agent_id`, `result` and the raw `args` — a census of every production READ found no reader for
 * the first two, and the third is replaced by the bounded target projection. `sequence_id` is dropped
 * rather than forwarded: on the host it encoded `${agentId}_${turnId}`, so the correlation key WAS the
 * agent's identity. Memory Core mints a fresh opaque token instead, which is correlation without
 * identification.
 * @param {Object} entry The host's snake_case log entry.
 * @returns {Object} The admitted action.
 */
function projectActionEntry(entry = {}) {
    return {
        sessionId : entry.session_id ?? null,
        timestamp : entry.timestamp,
        tool      : entry.tool,
        success   : entry.success === true || entry.success === 1,
        durationMs: entry.duration_ms,
        appName   : entry.app_name ?? null,
        targets   : projectTargets(entry.args)
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
