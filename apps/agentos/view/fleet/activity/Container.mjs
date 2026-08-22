import BufferedList from '../../../../../src/list/Buffered.mjs';
import Button       from '../../../../../src/button/Base.mjs';
import Component    from '../../../../../src/component/Base.mjs';
import Container    from '../../../../../src/container/Base.mjs';
import RowContainer from './RowContainer.mjs';

const COUNT_SCOPES = new Set(['last24h', 'total']);

/**
 * @summary Formats only complete, source-qualified activity count rows.
 *
 * No aggregate is inferred. A mailbox total stays labelled `mailbox`; an absent/incomplete row
 * renders nothing. The full producer source and capture times remain in the title.
 * @param {Object[]} counts
 * @returns {{text:String,title:String}|null}
 */
export function describeActivityCounts(counts) {
    const complete = Array.isArray(counts) ? counts.filter(row =>
        typeof row?.source === 'string' && row.source
        && COUNT_SCOPES.has(row.scope)
        && row.complete === true
        && Number.isInteger(row.value) && row.value >= 0
        && !Number.isNaN(Date.parse(row.capturedAt))
    ) : [];

    if (!complete.length) {
        return null
    }

    const groups = new Map();

    complete.forEach(row => {
        const group = groups.get(row.source) || {};

        if (!group[row.scope] || Date.parse(row.capturedAt) >= Date.parse(group[row.scope].capturedAt)) {
            group[row.scope] = row;
            groups.set(row.source, group)
        }
    });

    const display = source => source === 'memory-core:mailbox' ? 'mailbox' : source;

    return {
        text: [...groups].map(([source, rows]) => {
            const values = [];

            rows.last24h && values.push(`${rows.last24h.value} / 24h`);
            rows.total   && values.push(`${rows.total.value} total`);

            return `${display(source)} · ${values.join(' · ')}`
        }).join('  |  '),
        title: complete
            .map(row => `${row.source} ${row.scope}=${row.value} captured ${row.capturedAt}`)
            .join('\n')
    }
}

/**
 * @summary The Fleet cockpit's Store-backed, buffered activity history.
 *
 * The header, source counts and retention facts are stable chrome. The scroll seat is
 * {@link Neo.list.Buffered}: a fixed-height physical row pool over the provider-owned
 * {@link AgentOS.store.FleetActivityEvents} Store. New records at the leading edge preserve the
 * first visible record + pixel offset while history is being read and surface a `N new events`
 * affordance; at the top they arrive normally. Recycled history is excluded from the polite live
 * region, while one isolated announcer speaks only genuinely new producer ids.
 *
 * @class AgentOS.view.fleet.activity.Container
 * @extends Neo.container.Base
 */
class ActivityStream extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.activity.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.activity.Container',
        /**
         * @member {String} ntype='fm-activity-stream'
         * @protected
         */
        ntype: 'fm-activity-stream',
        /**
         * @member {String[]} baseCls=['fm-activity-stream']
         */
        baseCls: ['fm-activity-stream'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * Feed liveness: live, honestly-labelled sample, or stale last-known data.
         * @member {String} adapterState_='sample'
         * @reactive
         */
        adapterState_: 'sample',
        /**
         * Roster facts supplied by the cockpit owner.
         * @member {Object} actorDirectory_={}
         * @reactive
         */
        actorDirectory_: {},
        /**
         * Producer-owned count rows. Incomplete rows remain absent from the header.
         * @member {Object[]} counts_=[]
         * @reactive
         */
        counts_: [],
        /**
         * Fixed pooled-row height in both wide and narrow grammar.
         * @member {Number} itemHeight=52
         */
        itemHeight: 52,
        /**
         * Provider-owned activity Store shared across pane projections.
         * @member {AgentOS.store.FleetActivityEvents|null} store_=null
         * @reactive
         */
        store_: null
    }

    /** @member {Boolean} hasObservedStore=false @protected */
    hasObservedStore = false
    /** @member {Set<String>} knownEventIds @protected */
    knownEventIds = new Set()
    /** @member {Number} pendingNewEventCount=0 @protected */
    pendingNewEventCount = 0
    /** @member {Number} announcementSequence=0 @protected */
    announcementSequence = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.add([{
            module   : Container,
            cls      : ['fm-stream-head'],
            flex     : 'none',
            reference: 'header',
            items    : [{
                module   : Component,
                cls      : ['fm-stream-label'],
                flex     : 1,
                reference: 'label',
                text     : 'Live activity'
            }, {
                module   : Component,
                cls      : ['fm-stream-counts', 'is-empty'],
                reference: 'counts'
            }, {
                module   : Component,
                cls      : ['fm-stream-retention'],
                reference: 'retention'
            }, {
                module   : Component,
                cls      : ['fm-stream-state'],
                reference: 'state'
            }]
        }, {
            module          : BufferedList,
            autoDestroyStore: false,
            bufferRowRange  : 4,
            cls             : ['fm-activity-list'],
            disableSelection: true,
            flex            : 1,
            itemConfig      : () => ({module: RowContainer, actorDirectory: me.actorDirectory}),
            itemHeight      : me.itemHeight,
            itemsFocusable  : false,
            reference       : 'list',
            useInternalId   : false,
            vdom            : {'aria-label': 'Fleet activity history', 'aria-live': 'off'}
        }, {
            module   : Button,
            cls      : ['fm-stream-new-events'],
            handler  : me.onNewEventsClick.bind(me),
            hidden   : true,
            reference: 'new-events'
        }, {
            module   : Component,
            cls      : ['fm-stream-announcer'],
            reference: 'announcer',
            role     : 'status',
            vdom     : {'aria-atomic': 'true', 'aria-live': 'polite'}
        }])
    }

    /** @param {String} value @param {String} oldValue @protected */
    afterSetAdapterState(value, oldValue) {
        this.isConstructed && this.updateHeader()
    }

    /** @param {Object} value @param {Object} oldValue @protected */
    afterSetActorDirectory(value, oldValue) {
        if (this.isConstructed) {
            this.getReference('list')?.items?.filter(Boolean).forEach(row => {
                row.actorDirectory = value
            })
        }
    }

    /** @param {Object[]} value @param {Object[]} oldValue @protected */
    afterSetCounts(value, oldValue) {
        this.isConstructed && this.updateHeader()
    }

    /**
     * @summary Binds the provider-owned Store into the buffered projection without transferring
     * ownership; the same Store survives pane retirement and re-projection.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        const me = this;

        oldValue?.un('load', me.onActivityStoreLoad, me);
        value?.on('load', me.onActivityStoreLoad, me);

        if (me.isConstructed) {
            const list = me.getReference('list');

            list && (list.store = value);
            me.syncKnownEventIds(false);
            me.updateHeader()
        }
    }

    /** @param {Object[]} value @returns {Object[]} @protected */
    beforeSetCounts(value) {
        return Array.isArray(value) ? value : []
    }

    /**
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        const me   = this,
              list = me.getReference('list');

        Object.assign(me.vdom, {'aria-label': 'Live fleet activity', role: 'log', tabIndex: 0});

        list?.on('createItems', me.onListCreateItems, me);
        list && (list.store = me.store);

        me.syncKnownEventIds(false);
        me.updateHeader()
    }

    /**
     * @summary Tracks genuinely new producer ids and keeps recycled history out of announcements.
     * @protected
     */
    onActivityStoreLoad() {
        this.syncKnownEventIds(true);
        this.updateHeader()
    }

    /**
     * @summary Clears the pending-new affordance when the operator returns to the leading edge.
     * @protected
     */
    onListCreateItems() {
        const list = this.getReference('list');

        if (list?.scrollTop === 0 && this.pendingNewEventCount > 0) {
            this.pendingNewEventCount = 0;
            this.updateNewEventsButton()
        }
    }

    /**
     * @summary Returns the buffered list to newest-first index zero.
     * @protected
     */
    onNewEventsClick() {
        const list = this.getReference('list');

        list?.scrollToIndex(0);
        this.pendingNewEventCount = 0;
        this.updateNewEventsButton()
    }

    /**
     * @summary Reconciles Store membership identity into announcement and history-anchor state.
     * @param {Boolean} announce
     * @protected
     */
    syncKnownEventIds(announce) {
        const
            me      = this,
            nextIds = new Set((me.store?.items || []).map(record => record.eventId)),
            newIds  = [...nextIds].filter(eventId => !me.knownEventIds.has(eventId)),
            list    = me.getReference('list');

        if (announce && me.hasObservedStore && newIds.length > 0) {
            const noun = newIds.length === 1 ? 'event' : 'events';

            if ((list?.scrollTop || 0) > 0) {
                me.pendingNewEventCount += newIds.length
            }

            // Alternate an invisible separator so equal-sized consecutive arrivals remain distinct
            // live-region mutations without changing the spoken sentence.
            me.announcementSequence++;
            me.getReference('announcer').text = `${newIds.length} new fleet activity ${noun}${me.announcementSequence % 2 ? '\u200b' : ''}`
        }

        me.knownEventIds  = nextIds;
        me.hasObservedStore = true;
        me.updateNewEventsButton()
    }

    /**
     * @summary Updates stable header components from liveness, source-count and local-retention truth.
     * @protected
     */
    updateHeader() {
        const
            me         = this,
            header     = me.getReference('header'),
            countsCell = me.getReference('counts'),
            stateCell  = me.getReference('state'),
            retained   = me.store?.count ?? 0,
            dropped    = me.store?.droppedCount ?? 0,
            countView  = describeActivityCounts(me.counts),
            stateText  = {sample: 'sample · live feed pending', stale: 'stale — reconnecting'}[me.adapterState] ?? '● streaming',
            stateCls   = {sample: 'is-sample', stale: 'is-stale'}[me.adapterState] ?? 'is-live';

        if (!header || !countsCell || !stateCell) {
            return
        }

        header.cls = ['fm-stream-head', stateCls];

        countsCell.vdom.title = countView?.title ?? null;
        countsCell.set({
            cls : ['fm-stream-counts', ...(!countView ? ['is-empty'] : [])],
            text: countView?.text ?? ''
        });

        me.getReference('retention').text = `${retained} retained${dropped ? ` · ${dropped} dropped` : ''}`;
        stateCell.text = stateText
    }

    /**
     * @summary Renders the history-reading affordance without stealing the viewport.
     * @protected
     */
    updateNewEventsButton() {
        const button = this.getReference('new-events'),
              count  = this.pendingNewEventCount;

        button?.set({
            hidden: count === 0,
            text  : count === 1 ? '1 new event ↑' : `${count} new events ↑`
        })
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        const me = this;

        me.store?.un('load', me.onActivityStoreLoad, me);
        me.getReference('list')?.un('createItems', me.onListCreateItems, me);

        super.destroy(...args)
    }
}

export default Neo.setupClass(ActivityStream);
