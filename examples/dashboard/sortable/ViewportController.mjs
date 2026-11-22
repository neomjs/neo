import ComponentController         from '../../../src/controller/Component.mjs';
import {createFeed, HISTORY, KPIS} from './kpis.mjs';
import KpiStore                    from './KpiStore.mjs';

/**
 * @summary Owns the sortable dashboard's data: one store of key figures, which it hands to every tile, and the feed
 * that extends each figure once a second. The tiles follow their records themselves, so a tile in a window of its
 * own keeps updating. The feed timer has one creator (`onComponentConstructed`) and one destructor (`destroy`).
 * @class Neo.examples.dashboard.sortable.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.ViewportController'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.ViewportController'
    }

    /**
     * Each key figure's feed, keyed by the figure's id.
     * @member {Object} feeds={}
     * @protected
     */
    feeds = {}
    /**
     * The interval id of the running feed, or `null`.
     * @member {Number|null} feedTimer=null
     * @protected
     */
    feedTimer = null
    /**
     * @member {Neo.examples.dashboard.sortable.KpiStore|null} store=null
     * @protected
     */
    store = null

    /**
     * @summary Stops the feed and drops the store the tiles share.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.feedTimer && clearInterval(me.feedTimer);
        me.feedTimer = null;
        me.store?.destroy();

        super.destroy(...args)
    }

    /**
     * @summary Fills the store with every figure's opening readings, hands each tile the store and its dashboard, and
     * starts the feed.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me = this;

        me.store = Neo.create(KpiStore, {
            data: KPIS.map((kpi, index) => {
                const feed    = createFeed(kpi, index),
                      history = Array.from({length: HISTORY}, () => feed.next());

                me.feeds[kpi.id] = feed;

                return {
                    format: kpi.format,
                    history,
                    id    : kpi.id,
                    label : kpi.label,
                    rising: kpi.rising,
                    value : history.at(-1)
                }
            })
        });

        const dashboard = me.getReference('dashboard');

        dashboard.items.forEach(tile => {
            tile.dashboard = dashboard;
            tile.store     = me.store
        });

        me.feedTimer = setInterval(() => me.tick(), 1000)
    }

    /**
     * @summary Appends one reading to every figure and drops its oldest one.
     * @protected
     */
    tick() {
        let me = this;

        me.store.forEach(record => {
            const value = me.feeds[record.id].next();

            record.set({
                history: [...record.history.slice(1), value],
                value
            })
        })
    }
}

export default Neo.setupClass(ViewportController);
