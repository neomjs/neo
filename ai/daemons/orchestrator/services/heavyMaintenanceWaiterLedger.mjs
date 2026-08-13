import fs   from 'fs';
import path from 'path';

import {writeFileAtomicSync} from '../../../services/shared/atomicFileWrite.mjs';

/**
 * @module ai/daemons/orchestrator/services/heavyMaintenanceWaiterLedger
 * @summary The waiter half of heavy-maintenance lease fairness — who is waiting, since when.
 *
 * The lease file records who HOLDS; nothing records who WAITS, which is why a short-cadence
 * holder could structurally out-compete a starving priority task for hours while every health
 * surface read green. This ledger closes that gap without touching the lease's CAS semantics:
 * each deferred task upserts exactly one file it alone owns inside a sibling
 * `heavy-maintenance-waiters/` directory, so writers never contend and readers only glob.
 *
 * Entries carry the DURABLE deferral streak start (`deferredSince`, from the persisted task
 * envelope) rather than a per-poll timestamp — the streak survives blocker rotation and process
 * restarts, and the fairness decision must reason about the same quantity the starvation
 * measurement records. Entries expire by `updatedAt` age so a crashed waiter cannot veto
 * acquisitions forever; a live waiter refreshes on every deferred poll.
 *
 * Pure and Neo-free by the same rule as the lease primitives: the AiConfig-aware boundary
 * resolves directories and thresholds and passes them in.
 */

const WAITERS_DIR_NAME = 'heavy-maintenance-waiters';

/**
 * @summary Resolves the waiters directory next to the lease file.
 * @param {Object} options
 * @param {String} options.leasePath Resolved heavy-maintenance lease path.
 * @returns {String} Absolute waiters directory path.
 */
export function resolveWaitersDir({leasePath} = {}) {
    if (typeof leasePath !== 'string' || !leasePath.trim()) {
        throw new TypeError('resolveWaitersDir: a resolved leasePath is required');
    }

    return path.join(path.dirname(leasePath), WAITERS_DIR_NAME);
}

function waiterFilePath(dir, taskName) {
    // Task names are orchestrator-declared identifiers; the replace guards path traversal from
    // any future dynamic name without changing legitimate names (letters, digits, dashes).
    return path.join(dir, `${String(taskName).replace(/[^\w.-]/g, '_')}.json`);
}

/**
 * @summary Upserts the calling task's waiter entry — one file, owned by exactly one writer.
 *
 * @param {Object} options
 * @param {String} options.leasePath Resolved lease path (the ledger lives beside it).
 * @param {String} options.taskName The deferred task.
 * @param {Boolean} [options.priorityZero=false] Whether the task is scheduler priority-0.
 * @param {Boolean} [options.bootstrapCritical=false] Whether the task is doing bootstrap-critical
 * work — initializing durable state a plane cannot function without (e.g. a tenant corpus with
 * uncheckpointed repos). Evaluated fresh on every registration so the class evaporates the
 * moment the underlying state completes.
 * @param {String} options.deferredSince Durable streak start (ISO) from the task envelope.
 * @param {Object} [options.fsModule=fs] Injected fs for fixtures.
 * @param {Date|Number} [options.now=new Date()] Clock seam.
 * @param {Number} [options.pid=process.pid] Recorded for forensics, not liveness.
 * @returns {Object} The persisted waiter entry.
 */
export function registerWaiterSync({leasePath, taskName, priorityZero = false, bootstrapCritical = false, deferredSince, fsModule = fs, now = new Date(), pid = process.pid} = {}) {
    if (!taskName) {
        throw new TypeError('registerWaiterSync: taskName is required');
    }

    if (typeof deferredSince !== 'string' || Number.isNaN(Date.parse(deferredSince))) {
        throw new TypeError('registerWaiterSync: deferredSince must be the durable ISO streak start — an unmeasured wait must not register as a fresh one');
    }

    const dir = resolveWaitersDir({leasePath});

    const entry = {
        taskName,
        priorityZero     : priorityZero === true,
        bootstrapCritical: bootstrapCritical === true,
        deferredSince,
        updatedAt        : new Date(typeof now === 'number' ? now : now.getTime()).toISOString(),
        pid
    };

    // Atomic per-file replace: the rename inside the primitive is the commit, so a reader
    // never sees a torn entry.
    writeFileAtomicSync(waiterFilePath(dir, taskName), JSON.stringify(entry, null, 2), {fsModule});

    return entry;
}

/**
 * @summary Removes the calling task's waiter entry — it acquired, ran, or stopped waiting.
 * @param {Object} options
 * @param {String} options.leasePath Resolved lease path.
 * @param {String} options.taskName The task whose entry clears.
 * @param {Object} [options.fsModule=fs] Injected fs.
 */
export function clearWaiterSync({leasePath, taskName, fsModule = fs} = {}) {
    if (!taskName) return;

    try {
        fsModule.unlinkSync(waiterFilePath(resolveWaitersDir({leasePath}), taskName));
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
}

/**
 * @summary Lists live waiter entries — expired and unreadable entries are reported, never thrown.
 *
 * Fail-open by design: a corrupt entry must not block lease acquisition plane-wide, but it is
 * surfaced in `unreadable` so the caller can log it rather than silently losing a waiter.
 *
 * @param {Object} options
 * @param {String} options.leasePath Resolved lease path.
 * @param {Number} options.staleAfterMs Entry freshness bound (a dead waiter cannot veto forever).
 * @param {Object} [options.fsModule=fs] Injected fs.
 * @param {Date|Number} [options.now=new Date()] Clock seam.
 * @returns {{waiters: Object[], unreadable: String[]}} Live entries plus unreadable file names.
 */
export function listActiveWaitersSync({leasePath, staleAfterMs, fsModule = fs, now = new Date()} = {}) {
    if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
        throw new TypeError('listActiveWaitersSync: a positive staleAfterMs is required — an unexpirable waiter is a new starvation shape');
    }

    const dir   = resolveWaitersDir({leasePath});
    const nowMs = typeof now === 'number' ? now : now.getTime();

    let names;
    try {
        names = fsModule.readdirSync(dir);
    } catch (e) {
        if (e.code === 'ENOENT') {
            return {waiters: [], unreadable: []};
        }
        throw e;
    }

    const waiters    = [];
    const unreadable = [];

    for (const name of names) {
        if (!name.endsWith('.json')) continue;

        try {
            const entry     = JSON.parse(fsModule.readFileSync(path.join(dir, name), 'utf8'));
            const updatedMs = Date.parse(entry?.updatedAt);

            if (!entry?.taskName || Number.isNaN(updatedMs) || Number.isNaN(Date.parse(entry?.deferredSince))) {
                unreadable.push(name);
                continue;
            }

            if (nowMs - updatedMs <= staleAfterMs) {
                waiters.push(entry);
            }
        } catch {
            unreadable.push(name);
        }
    }

    return {waiters, unreadable};
}

/**
 * @summary The fairness decision: must `taskName` yield the acquisition to a registered waiter?
 *
 * A candidate yields when a live waiter (not itself) outranks it in the three-rank order:
 * priority-0 beats everything below it; bootstrap-critical (initializing durable state the
 * plane cannot function without) beats ordinary enrichment/maintenance immediately — an
 * uninitialized corpus must not wait out a starvation bound while cycles of downstream work
 * re-acquire ahead of it; and an ordinary waiter starving past `fairnessYieldAfterMs` beats a
 * candidate that has not been waiting at least as long itself. Ties in the same class do NOT
 * force a yield — the lease's normal contention handles peers; fairness only prevents a fresh
 * or lower-class acquirer from stepping past someone measurably starving.
 *
 * @param {Object} options
 * @param {String} options.taskName The would-be acquirer.
 * @param {Boolean} [options.priorityZero=false] Acquirer's priority class.
 * @param {Boolean} [options.bootstrapCritical=false] Acquirer's bootstrap-critical class.
 * @param {String|null} [options.ownDeferredSince=null] Acquirer's own durable streak start, if any.
 * @param {Object[]} options.waiters Live entries from {@link listActiveWaitersSync}.
 * @param {Number} options.fairnessYieldAfterMs Starvation bound that activates seniority yielding.
 * @param {Date|Number} [options.now=new Date()] Clock seam.
 * @returns {Object|null} The waiter to yield to, or `null` when acquisition may proceed.
 */
export function findWaiterToYieldTo({taskName, priorityZero = false, bootstrapCritical = false, ownDeferredSince = null, waiters, fairnessYieldAfterMs, now = new Date()} = {}) {
    if (!Array.isArray(waiters) || waiters.length === 0) {
        return null;
    }

    if (!Number.isFinite(fairnessYieldAfterMs) || fairnessYieldAfterMs <= 0) {
        throw new TypeError('findWaiterToYieldTo: a positive fairnessYieldAfterMs is required');
    }

    const nowMs   = typeof now === 'number' ? now : now.getTime();
    const ownMs   = ownDeferredSince ? Date.parse(ownDeferredSince) : null;
    let   yieldTo = null;

    for (const waiter of waiters) {
        if (waiter.taskName === taskName) continue;

        const waiterMs   = Date.parse(waiter.deferredSince);
        const starvingMs = nowMs - waiterMs;

        const outranksByClass     = waiter.priorityZero === true && priorityZero !== true;
        const outranksByBootstrap = waiter.bootstrapCritical === true && bootstrapCritical !== true && priorityZero !== true;
        const outranksByAge       = starvingMs >= fairnessYieldAfterMs && (ownMs === null || waiterMs < ownMs);

        if (outranksByClass || outranksByBootstrap || outranksByAge) {
            if (!yieldTo || Date.parse(yieldTo.deferredSince) > waiterMs) {
                yieldTo = waiter;
            }
        }
    }

    return yieldTo;
}
