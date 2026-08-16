import Store           from '../../../src/data/Store.mjs';
import WakeSignalModel from '../model/WakeSignal.mjs';

/**
 * @class AgentOS.store.ViewerWakeFeed
 * @extends Neo.data.Store
 *
 * @summary The cockpit-scoped feed of received per-viewer wakes — newest-first, bounded, a
 * telltale's detail rather than an archive. The store is provider-owned at the cockpit root (the
 * stream belongs to the composition root; panes come and go), and the bound keeps it a telltale:
 * history authority stays with the plane, reachable via `poll-digest` — this feed only shows
 * what THIS viewer's live stream observed.
 */
class ViewerWakeFeed extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.ViewerWakeFeed'
         * @protected
         */
        className: 'AgentOS.store.ViewerWakeFeed',
        /**
         * @member {String} keyProperty='eventId'
         */
        keyProperty: 'eventId',
        /**
         * The feed bound — the oldest signal falls off once exceeded. A telltale detail needs
         * "what just happened", not everything that ever did.
         * @member {Number} maxSignals=100
         */
        maxSignals: 100,
        /**
         * @member {Neo.data.Model} model=WakeSignalModel
         * @reactive
         */
        model: WakeSignalModel
    }

    /**
     * @summary Appends one observed wake at the head (newest-first by construction) and enforces
     * the bound. A duplicate `eventId` (the same envelope re-pushed after a reconnect) is removed
     * first and re-enters at the head — a re-receipt moves the fact, it never double-counts it.
     * @param {Object} signalData Raw {@link AgentOS.model.WakeSignal} field data.
     * @returns {Object} The stored record.
     */
    addSignal(signalData) {
        const me = this;

        if (signalData?.eventId && me.get(signalData.eventId)) {
            me.remove(signalData.eventId)
        }

        me.insert(0, signalData);

        while (me.getCount() > me.maxSignals) {
            me.removeAt(me.getCount() - 1)
        }

        return me.getAt(0)
    }
}

export default Neo.setupClass(ViewerWakeFeed);
