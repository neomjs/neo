import {createDrainDispositionTracker} from '../shared/drainDisposition.mjs';
import {readPendingMessageWalRecords}  from '../../services/memory-core/helpers/messageWalStore.mjs';

/**
 * @module ai/daemons/message/drainCycle
 * @summary Host-agnostic message WAL drain loop topology.
 *
 * This module intentionally owns only the drain-host mechanics: read graph-pending accepted
 * message WAL records from the configured directory, batch them, retry the injected replay
 * processor, and expose a loop host that both the local daemon and in-process Memory Core mode can
 * share. A2A-message vector/search population is outside this topology layer.
 */

/**
 * @summary Computes the exponential backoff delay for a message replay retry.
 * @param {Number} backoffBaseMs Base delay.
 * @param {Number} attempt Zero-based retry attempt.
 * @returns {Number}
 */
export function getMessageDrainBackoffDelayMs(backoffBaseMs, attempt) {
    return backoffBaseMs * 2 ** attempt;
}

function normalizeProcessResult(records, result = {}) {
    const drained  = Number.isFinite(result.drained)  ? result.drained  : records.length,
          failed   = Number.isFinite(result.failed)   ? result.failed   : 0,
          deferred = Number.isFinite(result.deferred) ? result.deferred : 0;

    return {drained, failed, deferred};
}

/**
 * @summary Adapts MailboxService's graph-projection drain into the generic loop processor shape.
 * @param {Object} mailboxService Service exposing `drainPendingMessageGraphProjections`.
 * @returns {Function} Processor compatible with {@link processMessageBatch}.
 */
export function createMessageGraphProjectionProcessor(mailboxService) {
    return async records => {
        const ids     = records.map(record => record.id).filter(Boolean);
        const summary = await mailboxService.drainPendingMessageGraphProjections({
            ids,
            limit: records.length
        });

        return {
            drained : summary.projected,
            failed  : summary.failed,
            deferred: Math.max(summary.pending - summary.projected - summary.failed, 0)
        };
    };
}

/**
 * @summary Processes one batch of accepted message WAL records via an injected replay processor.
 *
 * Missing processor is a deliberate non-mutating state for direct unit use. The hosted drain cycle
 * short-circuits before reading WAL segments when no processor is wired.
 *
 * @param {Object} options
 * @param {Object[]} options.records Message WAL records.
 * @param {Function|null} [options.processRecords] Optional replay processor.
 * @param {Number} options.maxRetries In-cycle retry bound.
 * @param {Number} options.backoffBaseMs Retry backoff base.
 * @param {Function} [options.sleep] Delay primitive.
 * @param {Function} [options.log] Log sink.
 * @returns {Promise<{drained: Number, failed: Number, deferred: Number}>}
 */
export async function processMessageBatch({
    records,
    processRecords,
    maxRetries,
    backoffBaseMs,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    log   = () => {}
} = {}) {
    if (!records?.length) {
        return {drained: 0, failed: 0, deferred: 0};
    }

    if (!processRecords) {
        return {drained: 0, failed: 0, deferred: records.length};
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return normalizeProcessResult(records, await processRecords(records));
        } catch (error) {
            if (attempt < maxRetries) {
                const delay = getMessageDrainBackoffDelayMs(backoffBaseMs, attempt);
                log('INFO', `Message WAL replay attempt ${attempt + 1}/${maxRetries + 1} failed (${error.message}) — backing off ${delay}ms`);
                await sleep(delay);
            } else {
                log('ERROR', `Message WAL replay exhausted ${maxRetries + 1} attempts (${error.message})`);
            }
        }
    }

    return {drained: 0, failed: records.length, deferred: 0};
}

/**
 * @summary Executes one message WAL drain cycle.
 * @param {Object} options
 * @param {String} options.dir Message WAL directory.
 * @param {Number} options.batchSize Maximum records observed this cycle.
 * @param {Number} options.maxRetries Replay retry bound.
 * @param {Number} options.backoffBaseMs Replay retry backoff base.
 * @param {Function|null} [options.processRecords] Optional replay processor.
 * @param {Function} [options.log] Log sink.
 * @param {Function} [options.sleep] Delay primitive.
 * @param {Function} [options.readMessages] Pending WAL reader injection for tests.
 * @returns {Promise<{observed: Number, drained: Number, failed: Number, deferred: Number, inactive: Boolean, outstanding: Number}>}
 *     `outstanding` is the post-cycle residue (`observed - drained`) — the canonical field a
 *     disposition receipt reads for cleanliness. It captures every record read but not drained:
 *     batch-overflowed, failed, and deferred alike. `observed` is a pre-drain count and must never
 *     be read as work-left.
 */
export async function drainMessageWalOnce({
    dir,
    batchSize,
    maxRetries,
    backoffBaseMs,
    processRecords,
    log,
    sleep,
    readMessages = readPendingMessageWalRecords
} = {}) {
    if (!processRecords) {
        return {observed: 0, drained: 0, failed: 0, deferred: 0, inactive: true, outstanding: 0};
    }

    const records = await readMessages({dir});
    const bounded = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : records.length;
    const batch   = records.slice(0, bounded);
    const result  = await processMessageBatch({records: batch, processRecords, maxRetries, backoffBaseMs, sleep, log});

    // `outstanding` is everything read but not drained: batch-overflow (records beyond `bounded`)
    // plus the batch's own failed + deferred. Symmetric to the embed loop's residue.
    return {
        observed   : records.length,
        inactive   : false,
        outstanding: records.length - (result.drained ?? 0),
        ...result
    };
}

/**
 * @summary Hosts the message WAL drain loop in either daemon or in-process mode.
 * @param {Object} options
 * @param {Function} options.getConfig Returns the `messageWal` config slice.
 * @param {Function} [options.getProcessor] Optional resolver for the replay processor.
 * @param {Function} [options.log] Log sink.
 * @param {Function} [options.now] Clock source (epoch ms), injected into the disposition receipt so
 *     its `at` timestamp is testable without a real clock. Defaults to `Date.now`.
 * @returns {{stop: Function, getDisposition: Function}} Loop handle. `stop()` ends the loop
 *     (idempotent); `getDisposition()` returns this plane's drain receipt
 *     (`{state, drainedClean, reason, counts, at}` — see {@link createDrainDispositionTracker}).
 */
export function startMessageDrainLoop({getConfig, getProcessor = () => null, log = () => {}, now = Date.now}) {
    let stopped        = false,
        timer          = null,
        inactiveLogged = false;

    // Same receipt as the memory loop: the summary was computed and dropped. `inactive` is carried
    // as its own state rather than folded into clean-or-dirty — a loop that is deliberately not
    // draining has not drained cleanly, it simply has not drained.
    const disposition = createDrainDispositionTracker({now});

    const tick = async () => {
        const {dir, batchSize, maxRetries, backoffBaseMs, pollIntervalMs} = getConfig();

        const processRecords = getProcessor();

        try {
            const summary = await drainMessageWalOnce({
                dir,
                batchSize,
                maxRetries,
                backoffBaseMs,
                processRecords,
                log
            });

            if (summary.inactive) {
                if (!inactiveLogged) {
                    inactiveLogged = true;
                    log('INFO', 'Message WAL drain inactive: replay processor is not wired; skipping WAL reads until the projection leaf supplies one.');
                }
            } else {
                inactiveLogged = false;
            }

            disposition.recordCycle(summary);

            if (summary.drained > 0 || summary.failed > 0) {
                log('INFO', `Message WAL drain cycle: ${JSON.stringify(summary)}`);
            }
        } catch (error) {
            disposition.recordFailure(error);
            log('ERROR', `Message WAL drain cycle failed: ${error.message || error}`);
        }

        if (!stopped) {
            timer = setTimeout(tick, pollIntervalMs);
        }
    };

    timer = setTimeout(tick, 0);

    return {
        stop() {
            stopped = true;
            clearTimeout(timer);
        },

        /**
         * @summary The drain receipt for this plane — see `createDrainDispositionTracker`.
         * @returns {Object}
         */
        getDisposition: disposition.getDisposition
    };
}
