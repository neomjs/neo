import Button                              from '../../../../src/button/Base.mjs';
import Component                           from '../../../../src/component/Base.mjs';
import Container                           from '../../../../src/container/Base.mjs';
import CatchUpEntries                      from '../../store/CatchUpEntries.mjs';
import {formatViewerTime, viewerTimeTitle} from './viewerTime.mjs';

/**
 * @summary Resolve a citation to a canonical public drill target. Only the source-owned PR
 * descriptor (`get_conversation {pr_number}`) or its `pull:N` identity is routable. Session/memory
 * citations remain visible and copyable until a session-history surface exists; they never navigate
 * falsely to the bounded live stream.
 * @param {Object} citation
 * @returns {String|null}
 */
export function resolveCitationTarget(citation) {
    const fromDescriptor = citation?.drillDown?.operation === 'get_conversation'
        ? citation.drillDown.arguments?.pr_number
        : null,
          fromIdentity = /^pull:(\d+)$/.exec(citation?.id || '')?.[1],
          number       = Number(fromDescriptor ?? fromIdentity);

    return Number.isSafeInteger(number) && number > 0
        ? `https://github.com/neomjs/neo/pull/${number}`
        : null
}

/**
 * The invoked S3 Fleet catch-up surface.
 *
 * @summary Renders two source-owned `notAuthority` Bird View envelopes without synthesizing,
 * ranking, merging, or caching them. The pane owns only local projection Stores: one record per
 * source slot and one record per fleet/agent partition choice. It fires intent events for reads and
 * explicit mark-caught-up writes; the owning FleetCockpit holds the authenticated bridge.
 *
 * Honest states are first-class: first-use window choice, per-source unavailable/degraded/empty,
 * coverage counts and reasons, synthesis availability, manifest hash, generated timestamp, and
 * bounded citations all render explicitly. The source order and citation order are preserved.
 *
 * @class AgentOS.view.fleet.CatchUpPane
 * @extends Neo.container.Base
 */
class CatchUpPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.CatchUpPane'
         * @protected
         */
        className: 'AgentOS.view.fleet.CatchUpPane',
        /**
         * @member {String} ntype='fm-catch-up-pane'
         * @protected
         */
        ntype: 'fm-catch-up-pane',
        /**
         * @member {String[]} baseCls=['fm-catch-up-pane']
         */
        baseCls: ['fm-catch-up-pane'],
        /**
         * Active Memory partition. PR history stays Fleet-wide.
         * @member {String} activePartition_='unified'
         * @reactive
         */
        activePartition_: 'unified',
        /**
         * Maximum citations rendered per source before an honest overflow count.
         * @member {Number} citationLimit=20
         */
        citationLimit: 20,
        /**
         * Fleet/agent choices supplied by the cockpit from its provider-owned roster.
         * @member {Object[]} partitionOptions_=[]
         * @reactive
         */
        partitionOptions_: [],
        /**
         * Latest Fleet history response. `null` is unobserved, never empty.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * Explicit mark result written back by the owner.
         * @member {Object|null} markOutcome_=null
         * @reactive
         */
        markOutcome_: null,
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
            cls   : ['fm-catch-up-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['fm-catch-up-title'],
                flex : 1,
                text : 'Since you last looked'
            }, {
                ntype: 'component',
                cls  : ['fm-catch-up-authority'],
                text : 'query-time · not authority'
            }]
        }, {
            ntype    : 'component',
            cls      : ['fm-catch-up-window'],
            flex     : 'none',
            reference: 'catch-up-window',
            text     : 'History not observed yet'
        }, {
            ntype    : 'container',
            cls      : ['fm-catch-up-partitions'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'catch-up-partitions'
        }, {
            ntype    : 'container',
            cls      : ['fm-catch-up-first-use'],
            flex     : 'none',
            hidden   : true,
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'catch-up-first-use',
            items    : [{
                ntype: 'component',
                flex : 1,
                text : 'Choose the first window'
            }, {
                module : Button,
                text   : '24h',
                ui     : 'ghost',
                handler: 'up.onDailyClick'
            }, {
                module : Button,
                text   : '3 days',
                ui     : 'ghost',
                handler: 'up.onThreeDayClick'
            }, {
                module : Button,
                text   : 'Week',
                ui     : 'ghost',
                handler: 'up.onWeeklyClick'
            }]
        }, {
            ntype : 'container',
            cls   : ['fm-catch-up-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module : Button,
                text   : 'Live activity',
                iconCls: 'fa fa-bolt',
                ui     : 'ghost',
                handler: 'up.onLiveActivityClick'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                reference: 'catch-up-refresh',
                text     : 'Refresh',
                iconCls  : 'fa fa-rotate',
                ui       : 'ghost',
                handler  : 'up.onRefreshClick'
            }, {
                module   : Button,
                reference: 'catch-up-mark',
                text     : 'Mark caught up',
                iconCls  : 'fa fa-check',
                ui       : 'ghost',
                hidden   : true,
                handler  : 'up.onMarkClick'
            }]
        }, {
            ntype    : 'component',
            cls      : ['fm-catch-up-mark-outcome'],
            flex     : 'none',
            reference: 'catch-up-mark-outcome'
        }, {
            ntype    : 'container',
            cls      : ['fm-catch-up-sources'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'catch-up-sources'
        }]
    }

    /** @member {AgentOS.store.CatchUpEntries|null} contentStore=null */
    contentStore = null
    /** @member {AgentOS.store.CatchUpEntries|null} partitionStore=null */
    partitionStore = null

    /**
     * @summary Create the two pane-local Stores, render held owner state, then request history. An
     * auto-hidden pane is constructed only when revealed, so this is invoked-not-ambient by layout.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.contentStore   = Neo.create(CatchUpEntries);
        this.partitionStore = Neo.create(CatchUpEntries);
        this.refreshPartitions();
        this.applySnapshot();
        this.fire('historyRequest', {partition: this.activePartition})
    }

    /** @param {...*} args */
    destroy(...args) {
        this.contentStore?.destroy();
        this.partitionStore?.destroy();
        this.contentStore = this.partitionStore = null;
        super.destroy(...args)
    }

    /** @param {String} value @param {String} oldValue @returns {String} */
    beforeSetActivePartition(value, oldValue) {
        return value === 'unified' || /^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : (oldValue || 'unified')
    }

    /** @param {String} value @param {String} oldValue */
    afterSetActivePartition(value, oldValue) {
        this.isConstructed && this.refreshPartitions()
    }

    /** @param {Object[]} value @param {Object[]} oldValue */
    afterSetPartitionOptions(value, oldValue) {
        this.isConstructed && this.refreshPartitions()
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetMarkOutcome(value, oldValue) {
        if (!this.isConstructed) return;

        const target = this.getReference('catch-up-mark-outcome');

        target.text = value?.status === 'advanced'
            ? `Caught up through ${this.formatStamp(value.lastSeen)}`
            : value?.reason ? `Mark refused · ${value.reason}` : '';

        // T5 receipt on the containing line. Falsy removes, so a refusal or a cleared outcome cannot
        // keep the previous advance's instant hovering behind unrelated copy.
        target.changeVdomRootKey('title', value?.status === 'advanced' ? viewerTimeTitle(value.lastSeen) : null)
    }

    /** @summary Request a daily first-use window. */
    onDailyClick() { this.requestFirstUse('daily') }
    /** @summary Request a three-day first-use window. */
    onThreeDayClick() { this.requestFirstUse('3-day') }
    /** @summary Request a weekly first-use window. */
    onWeeklyClick() { this.requestFirstUse('weekly') }

    /** @param {String} firstUsePreset */
    requestFirstUse(firstUsePreset) {
        this.fire('historyRequest', {firstUsePreset, partition: this.activePartition})
    }

    /** @summary Re-read from the source-owned viewer anchor. */
    onRefreshClick() {
        this.fire('historyRequest', {partition: this.activePartition})
    }

    /** @summary Explicitly advance through the exact rendered window end. */
    onMarkClick() {
        const windowEnd = this.snapshot?.window?.windowEnd;

        windowEnd && this.fire('markCaughtUpRequest', {windowEnd})
    }

    /** @summary Open the existing bounded live adjacency, never reinterpret it as history. */
    onLiveActivityClick() {
        this.fire('liveSurfaceRequest', {target: 'activity-stream'})
    }

    /** @param {String} partition */
    onPartitionClick(partition) {
        if (partition === this.activePartition) return;

        this.activePartition = partition;
        this.fire('historyRequest', {partition})
    }

    /**
     * @summary Populate the partition Store and rebuild semantic Buttons in source order.
     */
    refreshPartitions() {
        if (!this.partitionStore) return;

        const options = [{id: 'unified', label: 'Whole fleet', partition: 'unified'}, ...(this.partitionOptions || [])]
            .filter((option, index, all) => option?.partition && all.findIndex(item => item.partition === option.partition) === index);

        this.partitionStore.clear();
        this.partitionStore.add(options.map(option => ({...option, kind: 'partition'})));

        const target = this.getReference('catch-up-partitions');

        target?.removeAll(true);
        target?.add(this.partitionStore.items.map(record => ({
            module : Button,
            cls    : record.partition === this.activePartition ? ['fm-catch-up-partition', 'is-active'] : ['fm-catch-up-partition'],
            text   : record.label || record.partition,
            ui     : 'ghost',
            handler: () => this.onPartitionClick(record.partition)
        })))
    }

    /**
     * @summary Project the latest response into source records and honest chrome.
     */
    applySnapshot() {
        const snapshot = this.snapshot,
              firstUse = snapshot?.needsFirstUseWindow === true,
              window   = snapshot?.window,
              windowEl = this.getReference('catch-up-window'),
              firstEl  = this.getReference('catch-up-first-use'),
              markEl   = this.getReference('catch-up-mark');

        if (windowEl) {
            windowEl.text = window
                ? `${this.formatStamp(window.windowStart)} → ${this.formatStamp(window.windowEnd)} · ${snapshot.partition === 'unified' ? 'whole fleet' : snapshot.partition}`
                : firstUse ? 'No runtime anchor yet' : 'History not observed yet';

            // Both bounds ride the receipt, in the order the sentence reads them — a catch-up window
            // is only citable as a PAIR, and a hover naming one end would be worse than naming none.
            windowEl.changeVdomRootKey('title', window ? viewerTimeTitle(window.windowStart, window.windowEnd) : null)
        }

        firstEl && (firstEl.hidden = !firstUse);
        markEl  && (markEl.hidden  = !window);

        if (!this.contentStore) return;

        this.contentStore.clear();

        if (snapshot?.sources) {
            this.contentStore.add([
                {id: 'memory', kind: 'source', label: snapshot.partition === 'unified' ? 'Memory · fleet' : `Memory · ${snapshot.partition}`, payload: snapshot.sources.memory},
                {id: 'pull-requests', kind: 'source', label: 'Resolved pull requests · fleet', payload: snapshot.sources.pullRequests}
            ])
        }

        const target = this.getReference('catch-up-sources');

        target?.removeAll(true);

        if (firstUse) {
            target?.add({module: Component, cls: ['fm-catch-up-empty'], text: 'Choose 24 hours, 3 days, or one week. No history window is invented.'})
        } else if (!snapshot?.sources) {
            target?.add({module: Component, cls: ['fm-catch-up-empty'], text: 'Catch-up source unavailable.'})
        } else {
            target?.add(this.contentStore.items.map(record => this.sourceCardConfig(record)))
        }
    }

    /**
     * @summary Build one source card from a Store record. The source envelope is rendered, never
     * rewritten; only display labels and citation bounds are pane-owned.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    sourceCardConfig(record) {
        const slot      = record.payload || {},
              envelope  = slot.envelope,
              coverage  = envelope?.coverage || {},
              citations = Array.isArray(envelope?.citations) ? envelope.citations : [],
              visible   = citations.slice(0, this.citationLimit),
              overflow  = Math.max(0, citations.length - visible.length),
              sourceCls = `is-${slot.state || 'unavailable'}`;

        let body;

        if (slot.state === 'unavailable' || !envelope) {
            body = slot.unavailableReason || 'source unavailable'
        } else if (coverage.totalResolved === 0) {
            body = 'No source records in this window.'
        } else if (envelope.synthesisAvailable) {
            body = envelope.synthesis
        } else {
            body = `Synthesis unavailable · ${envelope.synthesisUnavailableReason || coverage.degradedReason || 'no narrative'}`
        }

        const items = [{
            module: Container,
            cls   : ['fm-catch-up-source-head'],
            layout: {ntype: 'hbox', align: 'center'},
            items : [{module: Component, flex: 1, cls: ['fm-catch-up-source-title'], text: record.label},
                {module: Component, cls: ['fm-catch-up-source-state'], text: slot.state || 'unavailable'}]
        }, {
            module: Component,
            cls   : ['fm-catch-up-source-meta'],
            text  : envelope
                ? `${envelope.notAuthority === true ? 'not authority' : 'authority unproven'} · generated ${this.formatStamp(envelope.generatedAt)} · coverage ${coverage.included ?? 0}/${coverage.totalResolved ?? '?'} · manifest ${envelope.sourceManifestHash || 'unavailable'}`
                : 'No source envelope returned',
            // Built as config rather than assigned, so the receipt rides `vdom` here — same rule, the
            // other construction shape. This line is the one an agent quotes when citing a source
            // envelope, which makes its instant the least affordable one to lose.
            ...(envelope && viewerTimeTitle(envelope.generatedAt) ? {vdom: {title: viewerTimeTitle(envelope.generatedAt)}} : {})
        }, {
            module: Component,
            cls   : ['fm-catch-up-source-body'],
            text  : body
        }];

        if (coverage.degradedReason) {
            items.push({module: Component, cls: ['fm-catch-up-source-reason'], text: `Coverage degraded · ${coverage.degradedReason}`})
        }

        if (visible.length) {
            items.push({
                module: Container,
                cls   : ['fm-catch-up-citations'],
                layout: {ntype: 'vbox', align: 'stretch'},
                items : visible.map(citation => this.citationConfig(citation))
            })
        }

        if (overflow) {
            items.push({module: Component, cls: ['fm-catch-up-citation-overflow'], text: `${overflow} more citations in the source manifest`})
        }

        return {module: Container, cls: ['fm-catch-up-source', sourceCls], flex: 'none', layout: {ntype: 'vbox', align: 'stretch'}, items}
    }

    /**
     * @summary Build a canonical PR link or a visible non-navigating citation label.
     * @param {Object} citation
     * @returns {Object}
     */
    citationConfig(citation) {
        const target = resolveCitationTarget(citation),
              label  = `${citation?.type || 'source'} · ${citation?.id || 'unknown'}${citation?.inSynthesis === false ? ' · census only' : ''}`;

        return target ? {
            module: Component,
            cls   : ['fm-catch-up-citation', 'is-link'],
            vdom  : {tag: 'a', href: target, target: '_blank', rel: 'noopener noreferrer', text: label}
        } : {
            module: Component,
            cls   : ['fm-catch-up-citation'],
            text  : label
        }
    }

    /**
     * @summary Viewer-local stamp via the shared cockpit formatter. This pane, `MemoriesPane` and
     * `WakeRoutePane` each carried a byte-identical UTC formatter — one implementation copy-pasted
     * three times, which reads as consistency right up until the rule needs to change in one place.
     * The miss-copy stays here because a prose pane says "unknown time" where a dense row says "—".
     * @param {Date|String|Number|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return formatViewerTime(value)?.text ?? 'unknown time'
    }
}

export default Neo.setupClass(CatchUpPane);
