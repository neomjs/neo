import AgentWakeRoutes    from '../../store/AgentWakeRoutes.mjs';
import Button             from '../../../../src/button/Base.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import {formatViewerTime} from './viewerTime.mjs';

/**
 * The invoked Fleet wake-routes surface: can each seat be woken right now — and if not, WHICH leg
 * of the route broke.
 *
 * @summary Renders one viewer-bound `fleetWakeRoutes` envelope of DECOMPOSED per-seat wake axes
 * (subscription, arming, delivery lane, last terminal failure, presence) without fusing, ranking,
 * or caching them. The pane owns only a local projection Store of seat rows; it fires intent
 * events for reads and the owning FleetCockpit holds the authenticated bridge.
 *
 * Honest states are first-class, per axis AND per envelope: an axis nobody could observe renders
 * its own typed reason (`unobserved` / `unknown` — never coerced to healthy or absent), a degraded
 * capability names every silent axis in the meta line, and an unavailable verb renders as exactly
 * that. Fusing is the one thing this surface refuses to do: a fused verdict cannot say which leg
 * broke, and the crash-loop-that-reported-healthy incident class is why the legs stay separate.
 *
 * @class AgentOS.view.fleet.WakeRoutePane
 * @extends Neo.container.Base
 */
class WakeRoutePane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.WakeRoutePane'
         * @protected
         */
        className: 'AgentOS.view.fleet.WakeRoutePane',
        /**
         * @member {String} ntype='fm-wakeroutes-pane'
         * @protected
         */
        ntype: 'fm-wakeroutes-pane',
        /**
         * @member {String[]} baseCls=['fm-wakeroutes-pane']
         */
        baseCls: ['fm-wakeroutes-pane'],
        /**
         * Latest wake-routes envelope. `null` is unobserved, never empty.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['fm-wakeroutes-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['fm-wakeroutes-title'],
                flex : 1,
                text : 'Can they be woken?'
            }, {
                ntype: 'component',
                cls  : ['fm-wakeroutes-authority'],
                text : 'per-seat route axes · query-time · never fused'
            }]
        }, {
            ntype    : 'component',
            cls      : ['fm-wakeroutes-meta'],
            flex     : 'none',
            reference: 'wakeroutes-meta',
            text     : 'Wake routes not observed yet'
        }, {
            ntype    : 'container',
            cls      : ['fm-wakeroutes-rows'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'wakeroutes-rows'
        }, {
            ntype : 'container',
            cls   : ['fm-wakeroutes-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                reference: 'wakeroutes-refresh',
                text     : 'Read routes',
                iconCls  : 'fa fa-tower-broadcast',
                ui       : 'ghost',
                handler  : 'up.onRefreshClick'
            }]
        }]
    }

    /** @member {AgentOS.store.AgentWakeRoutes|null} seatStore=null */
    seatStore = null

    /**
     * @summary Create the pane-local Store and render held owner state. No read fires here:
     * reading the fleet's routes is the explicit first act, so an auto-hidden pane construction
     * never queries the plane on its own.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.seatStore = Neo.create(AgentWakeRoutes);
        this.applySnapshot()
    }

    /** @param {...*} args */
    destroy(...args) {
        this.seatStore?.destroy();
        this.seatStore = null;
        super.destroy(...args)
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /** @summary Read (or re-read) the decomposed routes for the whole roster. */
    onRefreshClick() {
        this.fire('wakeRoutesRequest', {})
    }

    /**
     * @summary Project the latest envelope into Store rows and honest chrome. A fresh envelope
     * always replaces the rows (the read is whole-roster, so partial merges could only fabricate
     * continuity); a degraded capability keeps its rows AND names every silent axis in the meta
     * line, because partial truth plus a named gap beats both silence and fabrication.
     */
    applySnapshot() {
        const
            me       = this,
            snapshot = me.snapshot,
            metaEl   = me.getReference('wakeroutes-meta'),
            wired    = snapshot?.capability?.state === 'wired',
            // Rows are adoptable only when the envelope carries PARTIAL truth. `degraded/none`
            // means the source could observe nothing (an unreadable roster included) — adopting
            // its empty seat list would render "No seats in the registry" for a registry nobody
            // could read, the exact fabrication the envelope exists to prevent.
            partial  = snapshot?.capability?.state === 'degraded' &&
                snapshot?.capability?.confidence === 'partial' &&
                Array.isArray(snapshot?.seats)

        if (!me.seatStore) return;

        me.seatStore.clear();

        if ((wired || partial) && Array.isArray(snapshot.seats)) {
            me.seatStore.add(snapshot.seats
                .filter(seat => typeof seat?.agentIdentity === 'string' && seat.agentIdentity)
                .map(seat => ({
                    agentIdentity     : seat.agentIdentity,
                    agentId           : seat.agentId,
                    subscriptionState : seat.subscription?.state,
                    subscriptionReason: seat.subscription?.reason,
                    armedState        : seat.armed?.state,
                    armedReason       : seat.armed?.reason,
                    deliveryState     : seat.delivery?.state,
                    deliveryReason    : seat.delivery?.reason,
                    failureState      : seat.lastFailure?.state,
                    failureReason     : seat.lastFailure?.reason,
                    failureErrorClass : seat.lastFailure?.receipt?.errorClass,
                    failureAt         : seat.lastFailure?.receipt?.failedAt,
                    presenceState     : seat.presence?.state,
                    presenceLastSeenAt: seat.presence?.lastSeenAt,
                    presenceReason    : seat.presence?.reason
                })))
        }

        if (metaEl) {
            metaEl.text = !snapshot
                ? 'Read the routes to see each seat’s wake path.'
                : wired
                    ? `${me.seatStore.count} seat routes · every axis observed · captured ${me.formatStamp(snapshot.capability.capturedAt)}`
                    : partial
                        ? `${me.seatStore.count} seat routes · silent axes: ${snapshot.capability.reason || 'unnamed'} · captured ${me.formatStamp(snapshot.capability.capturedAt)}`
                        : `Wake routes unavailable · ${snapshot.capability?.reason || 'unknown reason'}`
        }

        me.renderRows(snapshot, wired || partial)
    }

    /**
     * @summary Render the Store's seat rows (or the honest unobserved/unavailable/empty state).
     * @param {Object|null} snapshot
     * @param {Boolean} usable Whether the envelope carried adoptable rows.
     */
    renderRows(snapshot, usable) {
        const target = this.getReference('wakeroutes-rows');

        if (!target) return;

        target.removeAll(true);

        if (!snapshot) {
            target.add({
                module: Component,
                cls   : ['fm-wakeroutes-empty'],
                text  : 'Nothing here claims route health yet — reading is the explicit first act.'
            });
            return
        }

        if (!usable) {
            target.add({
                module: Component,
                cls   : ['fm-wakeroutes-empty'],
                text  : 'The wake-routes source did not answer. Nothing here claims reachability.'
            });
            return
        }

        if (this.seatStore.count === 0) {
            target.add({module: Component, cls: ['fm-wakeroutes-empty'], text: 'No seats in the registry.'});
            return
        }

        target.add(this.seatStore.items.map(record => this.seatCardConfig(record)))
    }

    /**
     * @summary Build one seat card from a Store record: the identity headline, the presence stamp,
     * and one line per axis — state in the SENTENCE (never colour alone), with the axis's own
     * retained reason when it could not answer or carries a diagnosis.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    seatCardConfig(record) {
        const
            me   = this,
            axes = [
                me.axisConfig('subscription', record.subscriptionState, record.subscriptionReason),
                me.axisConfig('armed',        record.armedState,        record.armedReason),
                me.axisConfig('delivery',     record.deliveryState,     record.deliveryReason),
                me.axisConfig('last failure', record.failureErrorClass
                    ? `${record.failureErrorClass} at ${me.formatStamp(record.failureAt)}`
                    : record.failureState, record.failureErrorClass ? null : record.failureReason),
                me.axisConfig('presence', record.presenceLastSeenAt
                    ? `${record.presenceState} · last seen ${me.formatStamp(record.presenceLastSeenAt)}`
                    : record.presenceState, record.presenceReason)
            ]

        return {
            module: Container,
            cls   : ['fm-wakeroutes-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Component,
                cls   : ['fm-wakeroutes-card-title'],
                text  : record.agentIdentity
            }, ...axes]
        }
    }

    /**
     * @summary Build one axis line. The state word travels in the text and doubles as the skin
     * hook (`is-<state>`); a null state is named as unreported rather than dropped.
     * @param {String} label
     * @param {String|null} state
     * @param {String|null} reason
     * @returns {Object}
     */
    axisConfig(label, state, reason) {
        const stateWord = state || 'unreported'

        return {
            module: Component,
            cls   : ['fm-wakeroutes-axis', `is-${stateWord.replace(/[^a-zA-Z0-9-]/g, '-')}`],
            text  : `${label}: ${stateWord}${reason ? ` — ${reason}` : ''}`
        }
    }

    /**
     * @summary Viewer-local stamp via the shared cockpit formatter — see `viewerTime.mjs` for why
     * format is single-sourced while this pane keeps its own "unknown time" miss-copy.
     * @param {Date|String|Number|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return formatViewerTime(value)?.text ?? 'unknown time'
    }
}

export default Neo.setupClass(WakeRoutePane);
