import Base from '../../../core/Base.mjs';

/**
 * @summary One re-projection of a dock Workspace, as a record: its adoption moment and its timing receipt.
 *
 * The Workspace chains every committed operation's view-sync onto its refresh tail; this class carries
 * what one link of that chain needs to know about itself, and nothing else.
 *
 * - **`adoption`** settles with the reconciler's outcome once the committed document is IN the host —
 *   the panes reparented, the staged transaction landed — before the collaborators, the FLIP motion and
 *   the post-projection hook that the Workspace's `refreshPromise` still waits out. A consumer that needs
 *   only the document in place (an emptied vessel that may close once its pane is home) awaits this; a
 *   consumer that needs the settled surface keeps awaiting the refresh. It never rejects: a cycle that is
 *   skipped, superseded, destroyed or repaired settles it with `null`, and the refresh stays the gate.
 * - **`timing`** is the receipt, in epoch milliseconds: `queuedAt` (the commit chained the cycle),
 *   `startedAt` (the settled tail and the one-tick deferral behind it), then one stamp per awaited step
 *   before the reconcile (`hostMounted` when the host had to mount first, `captured` after the FLIP
 *   capture, `released` after the stale reveal panes), `reconciled`, `settledAt`, and `flipPlayed` once
 *   the motion window closes; `waitedForTail` says whether an earlier cycle was still
 *   in flight when this one was chained, `landedInPlace` what the reconciler reported, and `awaiting` names the
 *   reconcile wait in flight (see {@link #beginWait}).
 * - **`predecessorTiming`** is the earlier cycle's live `timing` while this one waits on it. Read during a
 *   stall, its last stamp names the phase the earlier refresh never left. It is dropped once the tail
 *   settles, so no cycle keeps another alive. When the tail is a refresh no cycle owns (a direct repair),
 *   it is `{owner: 'unknown'}` rather than an older cycle's stamps (see {@link #timingOf}).
 *
 * @class Neo.dashboard.dock.projection.Cycle
 * @extends Neo.core.Base
 */
class Cycle extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.Cycle'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.Cycle',
        /**
         * The `timing` of the cycle chained before this one, held until the tail settles.
         * @member {Object|null} predecessorTiming=null
         */
        predecessorTiming: null,
        /**
         * Whether an earlier cycle was still in flight when this one was chained.
         * @member {Boolean} waitedForTail=false
         */
        waitedForTail: false
    }

    /**
     * The timing a cycle chained onto `tail` carries: the newest cycle's own when `tail` is the promise that cycle's
     * `run` returned, a marker when the tail is a refresh no cycle owns, `null` with no tail.
     * @param {Neo.dashboard.dock.projection.Cycle|null} cycle The newest cycle chained before the new one
     * @param {Promise|null} tail The Workspace's current refresh
     * @returns {Object|null}
     */
    static timingOf(cycle, tail) {
        if (!tail) return null;

        return cycle?.promise === tail ? cycle.timing : {owner: 'unknown'}
    }

    /**
     * Settles with the reconciler's outcome at adoption, or `null` when the cycle never adopted.
     * @member {Promise<Object|null>} adoption=null
     */
    adoption = null
    /**
     * The promise `run` returned: the Workspace's refresh while this cycle is the newest link.
     * @member {Promise|null} promise=null
     */
    promise = null
    /**
     * The phase receipt, in epoch milliseconds (see the class summary).
     * @member {Object} timing=null
     */
    timing = null
    /**
     * The adoption's resolver; `adopt` is its only caller.
     * @member {Function|null} resolveAdoption=null
     * @protected
     */
    resolveAdoption = null
    /**
     * The wait `timing.awaiting` names, by identity, so only that wait's end clears it.
     * @member {Object|null} currentWait=null
     * @protected
     */
    currentWait = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.timing   = {queuedAt: Date.now(), waitedForTail: me.waitedForTail};
        me.adoption = new Promise(resolve => me.resolveAdoption = resolve)
    }

    /**
     * @summary Records the adoption moment: the first call wins, later ones are no-ops.
     * @param {Object|null} result The reconciler's outcome, or `null` for a cycle that never adopted.
     */
    adopt(result) {
        if (result) {
            this.timing.landedInPlace = result.landedInPlace === true
        }

        this.resolveAdoption(result)
    }

    /**
     * @summary Chains this cycle's refresh onto the settled tail: one tick later, on a live workspace, with its
     * start stamped. Whatever the refresh did, the adoption is settled by the end (`null` if it never adopted),
     * and the returned promise keeps the refresh's own outcome, rejection included.
     * Workspace retirement during the owned delay stands down quietly; refresh failures remain observable.
     * @param {Promise} tail The previous refresh, already made safe to chain on.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {Function} refresh Runs the workspace's refresh for this cycle; receives the cycle.
     * @returns {Promise}
     */
    run(tail, workspace, refresh) {
        const me = this;

        return me.promise = tail
            .then(() => {
                me.predecessorTiming = null;
                return workspace.timeout(0).catch(error => {if (error !== Neo.isDestroyed) throw error})
            })
            .then(() => {
                if (!workspace.isDestroyed) {
                    me.timing.startedAt = Date.now();
                    return refresh(me)
                }
            })
            .finally(() => me.adopt(null))
    }

    /**
     * @summary Names the wait in flight: `timing.awaiting` holds `name` until the returned function ends this wait,
     * and ending it clears the name only while no later wait replaced it. A wait that repeats one name, such as an
     * ancestor loop, stays named after an earlier wait of that name has stamped its pair.
     * @param {String} name
     * @returns {Function} Ends this wait
     */
    beginWait(name) {
        const me   = this,
              wait = {name};

        me.currentWait     = wait;
        me.timing.awaiting = name;

        return () => {
            if (me.currentWait === wait) {
                me.currentWait = null;
                delete me.timing.awaiting
            }
        }
    }

    /**
     * @summary Stamps one phase of the receipt, in epoch milliseconds.
     * @param {String} name
     */
    stamp(name) {
        this.timing[name] = Date.now()
    }
}

export default Neo.setupClass(Cycle);
