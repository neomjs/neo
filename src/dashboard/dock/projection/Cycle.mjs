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
 *   `startedAt` (the settled tail and the one-tick deferral behind it), `reconciled`, `settledAt`, and
 *   `flipPlayed` once the motion window closes; `waitedForTail` says whether an earlier cycle was still
 *   in flight when this one was chained, `landedInPlace` what the reconciler reported.
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
         * Whether an earlier cycle was still in flight when this one was chained.
         * @member {Boolean} waitedForTail=false
         */
        waitedForTail: false
    }

    /**
     * Settles with the reconciler's outcome at adoption, or `null` when the cycle never adopted.
     * @member {Promise<Object|null>} adoption=null
     */
    adoption = null
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
     * @param {Promise} tail The previous refresh, already made safe to chain on.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @param {Function} refresh Runs the workspace's refresh for this cycle; receives the cycle.
     * @returns {Promise}
     */
    run(tail, workspace, refresh) {
        const me = this;

        return tail
            .then(() => workspace.timeout(0))
            .then(() => {
                if (!workspace.isDestroyed) {
                    me.timing.startedAt = Date.now();
                    return refresh(me)
                }
            })
            .finally(() => me.adopt(null))
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
