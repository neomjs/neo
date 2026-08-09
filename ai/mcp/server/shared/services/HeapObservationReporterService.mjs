import fs       from 'fs-extra';
import path     from 'node:path';
import Base     from '../../../../../src/core/Base.mjs';
import AiConfig from '../../../../config.mjs';

import {collectProcessHeapObservation} from '../../../../services/shared/processHeapObservation.mjs';

/**
 * @summary Publishes this process's own heap/non-heap observation on a cadence, so a sibling process
 * can read a split no Docker read operation can produce.
 *
 * **Direction is the whole point.** The orchestrator already writes a deployment-state snapshot into
 * the shared plane root and the MCP servers read it. This runs that same transport the other way: the
 * service writes, the orchestrator reads. The transport, the atomic-write idiom and the freshness
 * contract are all already proven across these container boundaries, so nothing here needs a new
 * capability envelope or a network dependency.
 *
 * **The record says it is self-reported, and that is not decoration.** Every other per-service fact in
 * the deployment-state snapshot is Docker-derived — observed *about* the process by something outside
 * it. This one is the process vouching for itself, which fails differently: a sick process does not
 * report a bad number, it stops reporting. A reader that cannot tell the two provenances apart will
 * eventually treat silence as health.
 *
 * **A write failure degrades the channel and never the service.** This is an observation lane; a
 * service that died because it could not describe its own heap would be a strictly worse outcome than
 * the unobservability it was meant to fix.
 *
 * @extends Neo.core.Base
 */
class HeapObservationReporterService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.HeapObservationReporterService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.HeapObservationReporterService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object|null} timer=null
     * @protected
     */
    timer = null

    /**
     * @summary Resolves the file this service publishes its observation to.
     *
     * One file per service rather than one shared file: two processes writing one path would make the
     * record's identity depend on write order, and the reader could not tell whose heap it read.
     *
     * `dir` defaults to the use-site config read rather than being threaded in by a caller. It is a
     * parameter at all because a spec must be able to publish into a temporary directory: the shared
     * `AiConfig` singleton is never mutated to isolate a test, which is the mechanism that bled test
     * data into live stores once already.
     *
     * @param {String}  serviceKey Stable service identity, e.g. `mc-server`.
     * @param {String} [dir]       Directory to publish into.
     * @returns {String} Absolute path.
     */
    observationPath(serviceKey, dir = AiConfig.heapObservation.dir) {
        return path.resolve(dir, `${serviceKey}.json`)
    }

    /**
     * @summary Captures one observation and publishes it atomically. Total: returns, never throws.
     *
     * Write-then-rename, matching how the deployment-state baseline is persisted: a direct write torn
     * by a crash would leave a fragment, and a reader parsing a fragment during a heap crisis is
     * exactly when a fabricated number does the most damage. `rename` within a directory is atomic, so
     * a reader sees the previous observation or the new one, never half of either.
     *
     * **Totality is the contract, and it is wider than the write.** Target resolution reads config and
     * calls `path.resolve`, the failure path calls an injected logger, and cleanup touches the disk
     * again — each is a caller-supplied or environment-dependent operation that can throw on its own.
     * An earlier revision guarded only the write, so a `dir` that would not resolve, a logger that
     * threw, or an unlinkable staging file escaped this method and reached the host service's boot.
     * That inverts the entire premise: a service must never die because it could not describe its own
     * heap. Every one of those boundaries is now inside a guard, and each has its own falsifier.
     *
     * @param {Object}   options
     * @param {String}   options.serviceKey Stable service identity.
     * @param {String}   [options.dir]      Directory to publish into.
     * @param {Function} [options.writeLog] Optional logger, called `(level, message)`.
     * @returns {Boolean} Whether the record reached disk.
     */
    writeOnce({serviceKey, dir, writeLog}) {
        let staging = null;

        try {
            const target = this.observationPath(serviceKey, dir);

            staging = `${target}.${process.pid}.tmp`;

            fs.outputJsonSync(staging, {
                schemaVersion: 1,
                recordType   : 'process-heap-observation',
                serviceKey,
                // Marked, never inferred. The reader distinguishes a process vouching for itself from
                // a fact observed about it from outside, because the two fail in different directions.
                provenance : 'self-reported',
                pid        : process.pid,
                observation: collectProcessHeapObservation()
            });

            fs.renameSync(staging, target);

            return true
        } catch (error) {
            // WARN, not ERROR: the channel degrading is a loss of visibility, and the reader's
            // staleness bound already reports that loss honestly as absence rather than as health.
            safely(() => writeLog?.('WARN', `[HeapObservationReporter] observation write FAILED for ${serviceKey}: ${error.message}. The heap/non-heap split is unobservable until this succeeds.`));
            // Best effort, and its failure is silent by design: the only thing left to report a failed
            // cleanup with is the logger that may itself be the reason we are here.
            staging && safely(() => fs.removeSync(staging));

            return false
        }
    }

    /**
     * @summary Begins publishing on the configured cadence. Total: returns, never throws.
     *
     * Writes once immediately so the channel is populated before the first interval elapses — a reader
     * starting inside that window would otherwise see absence and correctly, but uselessly, report the
     * observation as unavailable.
     *
     * The timer is unref'd: this lane must never be the reason a process stays alive.
     *
     * **This runs inside a server's boot path, so its own failure envelope is load-bearing.** Reading
     * the config leaves is itself an operation that can throw — an overlay that has not resolved, a
     * provider that rejects the read — and an escape here would take down the host service during
     * startup. The guard wraps the config reads too, not only the writes.
     *
     * `true` means the cadence started, NOT that the first write succeeded — a write failure is
     * reported through `writeOnce()`'s own return and must not stop the channel from trying again.
     * `config` is the same use-site-default seam the bridge's reader takes, so a spec can exercise the
     * disabled and unreadable arms without mutating the shared `AiConfig` singleton.
     *
     * @param {Object}   options
     * @param {String}   options.serviceKey Stable service identity.
     * @param {String}   [options.dir]      Directory to publish into.
     * @param {Function} [options.writeLog] Optional logger, called `(level, message)`.
     * @param {Object}   [options.config]   Resolved `heapObservation` leaves.
     * @returns {Boolean} Whether reporting started.
     */
    start({serviceKey, dir, writeLog, config = AiConfig.heapObservation}) {
        try {
            if (!config.enabled) {
                return false
            }

            const writeIntervalMs = config.writeIntervalMs;

            this.stop();
            this.writeOnce({serviceKey, dir, writeLog});

            this.timer = setInterval(() => this.writeOnce({serviceKey, dir, writeLog}), writeIntervalMs);
            this.timer.unref?.();

            return true
        } catch (error) {
            safely(() => writeLog?.('WARN', `[HeapObservationReporter] reporting NOT started for ${serviceKey}: ${error.message}. The heap/non-heap split is unobservable for this service.`));

            return false
        }
    }

    /**
     * @summary Stops publishing. Idempotent, and total for the same reason `start()` is: this runs on
     * a process-exit path where a throw would be attributed to whatever else is shutting down.
     * @returns {void}
     */
    stop() {
        const timer = this.timer;

        this.timer = null;

        timer && safely(() => clearInterval(timer))
    }
}

/**
 * @summary Runs a best-effort side effect, converting a throw into nothing.
 *
 * Used only on failure and teardown paths, where the alternative to swallowing is escaping into a host
 * service that has no better answer than this one. Never used around the write itself: that failure is
 * reported through the return value.
 *
 * @param {Function} effect The side effect to attempt.
 * @returns {void}
 */
function safely(effect) {
    try {
        effect()
    } catch (error) {
        // Intentionally silent: see above.
    }
}

export default Neo.setupClass(HeapObservationReporterService);
