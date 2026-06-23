import {
    acquireDrainLock as acquireBaseDrainLock,
    DrainLockHeldError,
    DRAIN_LOCK_FILENAME
} from '../embed/drainLock.mjs';

/**
 * @module ai/daemons/message/drainLock
 * @summary Message WAL drain-lock wrapper with message-specific remediation text.
 *
 * The mechanical lock primitive is shared with the memory embed daemon: one atomic
 * `<dir>/.drain-lock`, live-holder refusal, stale-holder reclaim, and idempotent release. This
 * wrapper keeps message-drain diagnostics domain-correct instead of telling operators to disable
 * the embed daemon when the conflict is between the local message daemon and
 * `messageWal.inProcessDrain`.
 */

export {DrainLockHeldError, DRAIN_LOCK_FILENAME};

const MESSAGE_DRAIN_LOCK_REMEDIATION =
    'Disable one message drain host for this deployment — the message daemon OR messageWal.inProcessDrain.';

/**
 * @summary Atomically claims the message WAL drain lock for one host.
 * @param {Object} options Same options as `ai/daemons/embed/drainLock.acquireDrainLock`.
 * @returns {{lockPath: String, pid: Number, owner: String, release: Function}}
 */
export function acquireMessageDrainLock(options = {}) {
    return acquireBaseDrainLock({
        ...options,
        lockLabel  : 'Message WAL',
        remediation: MESSAGE_DRAIN_LOCK_REMEDIATION
    });
}
